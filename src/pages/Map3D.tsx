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
  Play, Pause, MapPin, Radio, Loader, AlertCircle, List, X, FileDown, HelpCircle,
} from '../lib/icons';
import { Tooltip } from '../components/ui/Tooltip';
import { VolcanoLoader } from '../components/ui/VolcanoLoader';
import { Scene3D } from '../components/map3d/Scene3D';
import { Legend } from '../components/map3d/Legend';
import { RecordSection } from '../components/map3d/RecordSection';
import { loadNarinoRing } from '../components/map3d/narinoSilhouette';
import {
  getStations, getTravelTimes, getSynthetic, getRayPath,
  getSceneGeometry, getSceneEvents,
  type Station, type StationTravelTime, type SyntheticResult, type TravelModel,
  type RayPathResult, type WaveformResult, type SceneGeometry, type SceneHypocenter,
  type SceneEventInput, ApiError,
} from '../lib/api3d';
import { fetchEventWaveforms } from '../lib/api';
import { alignSyntheticToModel } from '../lib/alignSynthetic';
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
  downloadMap3dPdf, downloadMap3dCsv, downloadMap3dJson, DEFAULT_MAP3D_OPTIONS,
  type Map3dReportData, type Map3dReportOptions,
} from '../lib/map3dReport';
import { Pagination } from '../components/ui/Pagination';

/** Eventos por página en la lista del catálogo del Mapa 3D. */
const EVENTS_PER_PAGE = 12;

interface CatalogEvent {
  id: string;
  lat: number;
  lon: number;
  depthKm: number;
  /** true si la profundidad NO viene del catálogo (se asume para la escena). */
  depthAssumed: boolean;
  magnitude: number;
  date: string;
  label: string;
  sourceType: 'tectonic' | 'volcanic';
  nStations: number;
  /**
   * true si la coordenada es un punto por zona, no un epicentro real:
   * los eventos CM usan el centroide de estaciones y los del Galeras el cráter.
   */
  coordIsZone: boolean;
  /** Origen de datos reales MiniSEED si están disponibles ('galeras' | 'cm'). */
  mseedSource: 'galeras' | 'cm' | null;
  /** Estación principal con datos reales disponibles. */
  mseedStation: string | null;
  /** ID del evento tal como aparece en el nombre de archivo (puede diferir del UUID). */
  mseedEventId: string | null;
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
  // true cuando la profundidad activa NO viene del catálogo (evento sin dato
  // real o epicentro colocado a mano): se usa un valor asumido para la escena.
  const [depthAssumed, setDepthAssumed] = useState(false);
  // true cuando la ubicación del evento cargado es por zona (centroide de
  // estaciones en CM, cráter en Galeras), no un epicentro instrumental.
  const [coordIsZone, setCoordIsZone] = useState(false);
  const [sourceType, setSourceType] = useState<'tectonic' | 'volcanic'>('tectonic');

  // Sintéticos por estación, YA alineados al modelo activo (lo que se dibuja).
  const [traces, setTraces] = useState<Record<string, SyntheticResult | null>>({});
  // Sintéticos CRUDOS del backend (eje FDM homogéneo), por estación. Se guardan
  // para poder realinearlos a los tP/tS del nuevo modelo SIN volver a pedirlos.
  const rawTracesRef = useRef<Record<string, SyntheticResult | null>>({});
  // true mientras se realinean trazas por un cambio de modelo (indicador chico).
  const [realigning, setRealigning] = useState(false);
  const [selectedStation, setSelectedStation] = useState<string | null>(null);
  const [stationDetail, setStationDetail] = useState<SyntheticResult | null>(null);
  const [rayPath, setRayPath] = useState<RayPathResult | null>(null);
  // Señal real por estación (waveforms): si se muestra y datos.
  // setRealAvailable se conserva para el flujo de carga de MiniSEED.
  const [, setRealAvailable] = useState<Record<string, boolean>>({});
  // showReal: flag de "mostrar señal real" por estación. El render del panel ya
  // no lo lee (usa realWave directamente para evitar problemas de timing), pero
  // se conserva el setter para el flujo de carga.
  const [, setShowReal] = useState<Record<string, boolean>>({});
  const [realWave, setRealWave] = useState<Record<string, WaveformResult | null>>({});
  const [showTriaxial, setShowTriaxial] = useState(false);
  const [currentEventId, setCurrentEventId] = useState<string | null>(null);

  // Animación
  const [playing, setPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [speed, setSpeed] = useState(5);
  const rafRef = useRef<number>(0);
  const lastTsRef = useRef<number>(0);
  // true cuando el próximo cálculo que termine debe arrancar la animación sola
  // (lo activan colocar epicentro / cargar evento, NO cambiar el modelo o Vp/Vs).
  const autoplayPendingRef = useRef(false);
  // true cuando el próximo cambio de travelTimes debe regenerar los sismogramas
  // (nuevo sismo / cambio de Vp/Vs); false si solo cambió el modelo (tP/tS).
  const shouldRegenerateRef = useRef(true);

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
  const [reportFormat, setReportFormat] = useState<'pdf' | 'csv' | 'json'>('pdf');
  const [savingReport, setSavingReport] = useState(false);
  const [reportMsg, setReportMsg] = useState<string | null>(null);
  // El reporte debe GUARDARSE antes de poder descargarlo (CSV/PDF). Este flag
  // se pone en true cuando el guardado en "Mis Reportes" tuvo éxito. Para
  // usuarios sin sesión no hay guardado, así que se permite descargar directo.
  const [reportSaved, setReportSaved] = useState(false);
  // Título personalizado del reporte (editable por el usuario antes de guardar).
  const [reportTitle, setReportTitle] = useState('');
  // Contenedor de la escena 3D (para capturar su canvas en el reporte PDF).
  const sceneContainerRef = useRef<HTMLDivElement>(null);
  // Silueta del departamento de Nariño para el mapa del reporte (se carga una vez).
  const narinoRingRef = useRef<[number, number][] | null>(null);

  /**
   * Captura el canvas WebGL de la escena 3D como PNG (data URL).
   * Requiere preserveDrawingBuffer en el renderer (activado en Scene3D).
   * 
   * @param scale Factor de escala para aumentar la resolución (1 = tamaño actual, 2 = doble, etc.)
   * @returns Data URL de la imagen PNG, o null si falla
   */
  const captureScene = useCallback((scale: number = 1): string | null => {
    const canvas = sceneContainerRef.current?.querySelector('canvas') as HTMLCanvasElement | null;
    if (!canvas) return null;
    try {
      // Si scale === 1, captura directa sin procesamiento
      if (scale === 1) return canvas.toDataURL('image/png');

      // Para scale > 1, crear un canvas temporal con mayor resolución
      const tempCanvas = document.createElement('canvas');
      const ctx = tempCanvas.getContext('2d');
      if (!ctx) return canvas.toDataURL('image/png');

      // Dimensiones escaladas
      tempCanvas.width = canvas.width * scale;
      tempCanvas.height = canvas.height * scale;

      // Dibujar el canvas original escalado en el temporal
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(canvas, 0, 0, tempCanvas.width, tempCanvas.height);

      return tempCanvas.toDataURL('image/png');
    } catch (e) {
      console.warn('[Map3D] No se pudo capturar la escena 3D:', e);
      return null;
    }
  }, []);
  const [viewCommand, setViewCommand] = useState<{ view: 'north' | 'cut' | 'top' | 'fit'; nonce: number } | null>(null);
  const setView = (view: 'north' | 'cut' | 'top' | 'fit') => setViewCommand({ view, nonce: Date.now() });
  // true mientras se capturan las vistas para el reporte (deshabilita botones).
  const [capturingViews, setCapturingViews] = useState(false);

  /**
   * Captura las vistas de cámara (Norte, Corte, Superior) para el reporte PDF.
   * Mueve la cámara a cada vista, espera a que termine la transición (800 ms en
   * Scene3D) y toma la captura del canvas. La vista "Corte" solo tiene sentido
   * con una estación seleccionada; si no hay, se omite. Al final restaura la
   * vista oblicua por defecto. La reproducción del sismo sigue corriendo, así
   * que las capturas muestran los frentes de onda en movimiento.
   * 
   * Las capturas se realizan a escala 2x para mayor calidad en el PDF.
   */
  const captureAllViews = useCallback(async (): Promise<{ label: string; image: string }[]> => {
    const wait = (ms: number) => new Promise(res => setTimeout(res, ms));
    const views: { view: 'north' | 'cut' | 'top'; label: string }[] = [
      { view: 'north', label: 'Vista Norte (de frente)' },
      ...(selectedStation ? [{ view: 'cut' as const, label: 'Vista Corte (en profundidad)' }] : []),
      { view: 'top', label: 'Vista Superior (en planta)' },
    ];
    const out: { label: string; image: string }[] = [];
    for (const v of views) {
      setView(v.view);
      await wait(950); // transición de cámara (800 ms) + margen para repintar
      const img = captureScene(2); // escala 2x para mayor calidad
      if (img) out.push({ label: v.label, image: img });
    }
    // Restaurar la vista por defecto.
    setView('fit');
    await wait(300);
    return out;
  }, [captureScene, selectedStation]);
  // Filtros de la lista de eventos.
  // Filtros de la lista de eventos (misma lógica que el Explorador, en
  // src/lib/eventFilters.ts). Orden aparte (no es un filtro).
  const [evFilters, setEvFilters] = useState<EventFilters>(EMPTY_FILTERS);
  const [evSort, setEvSort] = useState<'date' | 'magnitude'>('date');
  const [evPage, setEvPage] = useState(1);
  // En móvil arrancamos con los paneles ocultos para que la escena 3D ocupe
  // todo el ancho; en escritorio se muestran de entrada.
  const [panelsCollapsed, setPanelsCollapsed] = useState(
    () =>
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(max-width: 1023px)').matches,
  );
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

  // Eventos de la página actual del catálogo (la lista completa es larga).
  const pagedRows = filteredRows.slice((evPage - 1) * EVENTS_PER_PAGE, evPage * EVENTS_PER_PAGE);

  // Al cambiar filtros, orden o abrir la lista, vuelve a la página 1.
  useEffect(() => {
    setEvPage(1);
  }, [evFilters, evSort, showEventList]);

  // Mapa id → CatalogEvent (para cargar en la escena al elegir una fila).
  const eventById = useMemo(() => {
    const m = new Map<string, CatalogEvent>();
    for (const e of events) m.set(e.id, e);
    return m;
  }, [events]);

  // Tiempo máximo del eje de sismogramas: el mayor tS + margen, PERO acotado a
  // la duración real de las trazas ya cargadas, para que el eje no termine en
  // 120 s si los datos acaban antes (dejando media sección vacía). Si aún no
  // hay trazas, se usa solo el tS teórico.
  const maxTime = useMemo(() => {
    const maxTs = travelTimes.reduce((m, t) => Math.max(m, t.tS ?? 0), 0);
    const theoretical = Math.max(20, Math.ceil(maxTs * 1.15));
    // FIN REAL de la señal: el backend genera cada sintético con duración =
    // (tiempo S)·1.6 + margen (ver run_fdm_synthetic en core/fdm.py), así que
    // el ÚLTIMO t del array (~110 s) va mucho más allá de donde la señal ya se
    // apagó (~67 s). Por eso el eje quedaba largo con media sección vacía. Aquí
    // tomamos el último instante con amplitud significativa (≥1% del máximo) de
    // la componente vertical de cada traza, y el eje llega hasta el mayor de
    // esos finales (entre estaciones) más un pequeño margen.
    let signalEnd = 0;
    for (const code of Object.keys(traces)) {
      const syn = traces[code];
      if (!syn || syn.t.length === 0) continue;
      const comp = syn.vertical;
      let maxAbs = 1e-9;
      for (const v of comp) maxAbs = Math.max(maxAbs, Math.abs(v));
      const thr = maxAbs * 0.01;
      for (let i = comp.length - 1; i >= 0; i--) {
        if (Math.abs(comp[i]) >= thr) { signalEnd = Math.max(signalEnd, syn.t[i]); break; }
      }
    }
    // Con señal: eje hasta el fin real + 8% de margen, nunca antes del tS
    // teórico (para que la S siempre se vea). Sin trazas aún: solo el teórico.
    if (signalEnd > 0) {
      const end = Math.max(signalEnd * 1.08, maxTs * 1.05);
      return Math.max(20, Math.ceil(end));
    }
    return theoretical;
  }, [travelTimes, traces]);

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
      const out: CatalogEvent[] = catalog
        .filter(r => r.latitude != null && r.longitude != null)
        .map(r => {
        const isVolc = r.event_type === 'volcanic';
        const subLabel = r.volcanic_subtype ? SUBTYPE_LABELS[r.volcanic_subtype] ?? '' : '';
        return {
          id: r.event_id,
          lat: r.latitude,
          lon: r.longitude,
          // Profundidad real si el catálogo la trae; si no, se asume para la escena.
          depthKm: r.depth_km != null ? r.depth_km : (isVolc ? 5 : 15),
          depthAssumed: r.depth_km == null,
          magnitude: r.magnitude ?? (isVolc ? 4.5 : 0),
          date: r.event_date,
          label: isVolc
            ? `Galeras · ${subLabel} · ${r.event_date}`.replace('·  ·', '·')
            : `M${r.magnitude ?? '?'} · ${r.event_date} · ${r.region ?? ''}`,
          sourceType: isVolc ? 'volcanic' : 'tectonic',
          nStations: r.station_count,
          // Coordenada por zona SOLO si no tiene epicentro real del SGC/USGS.
          coordIsZone: r.location_source !== 'SGC/USGS',
          // Metadatos de datos reales MiniSEED (del catálogo Supabase)
          mseedSource: (r.mseed_data_source as 'galeras' | 'cm') ?? null,
          mseedStation: r.mseed_station ?? null,
          // Para Galeras el event_id del archivo es el campo event_id (ej: '0602081159GVA')
          // Para CM también es el event_id (ej: 'CM_M2.5_2023-01-09T00-24-00')
          mseedEventId: r.mseed_available ? r.event_id : null,
        };
      });
      setEvents(out);

      // Posicionar los eventos del catálogo como hipocentros (backend calcula
      // x/y/z, radio y color por profundidad). Son distintos del epicentro activo.
      try {
        const input: SceneEventInput[] = out
          .filter(e => e.lat != null && e.lon != null)
          .map(e => ({
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

  // Códigos de estación cuya traza sintética aún se está generando (declarado
  // aquí arriba porque recomputeTravelTimes ya lo usa para evitar el parpadeo).
  const [loadingTraces, setLoadingTraces] = useState<Set<string>>(new Set());

  // ── Recalcular tiempos de viaje cuando cambia epicentro / modelo / velocidades ──
  // `regenerate` indica si además hay que regenerar los sismogramas sintéticos.
  // Al cambiar SOLO el modelo (homogéneo/IASP91) los sintéticos NO cambian (solo
  // cambian las marcas tP/tS), así que no se regeneran ni se muestra el loader:
  // la reproducción en curso sigue sin cortarse.

  // Ref para leer vp/vs/model siempre frescos desde el closure de
  // recomputeTravelTimes, sin que un stale closure provoque un 422 por enviar
  // valores desactualizados (p. ej. al cargar un evento volcánico que cambia
  // setVp/setVs en el mismo batch que setEpicenter).
  const vpVsModelRef = useRef({ vp, vs, model });
  // Actualizar el ref ANTES de cada render (no en useEffect, que corre después).
  vpVsModelRef.current = { vp, vs, model };

  const recomputeTravelTimes = useCallback(async (epi: { lat: number; lon: number; depthKm: number }, regenerate = true) => {
    // Solo el flujo que regenera trazas levanta `loadingTT` (y con él el overlay
    // de carga a pantalla completa). Al cambiar SOLO el modelo usamos `realigning`
    // (indicador chico en el panel) para no interrumpir la reproducción.
    if (regenerate) { setLoadingTT(true); setMessage('Calculando tiempos de viaje...'); }
    else { setRealigning(true); }
    // Coordenadas nunca deben ser null (se filtran al cargar el catálogo), pero
    // si llegan aquí por alguna razón, salir sin llamar al backend.
    if (epi.lat == null || epi.lon == null) {
      setMessage('No se pueden calcular los tiempos de viaje: coordenadas no disponibles para este evento.');
      if (regenerate) setLoadingTT(false);
      else setRealigning(false);
      return;
    }
    const { vp: vpVal, vs: vsVal, model: modelVal } = vpVsModelRef.current;
    try {
      const res = await getTravelTimes({
        lat: epi.lat, lon: epi.lon, depth_km: epi.depthKm,
        vp_km_s: vpVal, vs_km_s: vsVal, model: modelVal,
      });
      // El effect de [travelTimes] leerá esta bandera para decidir si regenera
      // los sismogramas o solo actualiza las marcas tP/tS.
      shouldRegenerateRef.current = regenerate;
      setTravelTimes(res.estaciones);
      if (regenerate) {
        // Marcar YA las estaciones como "en generación" para que isCalculating no
        // caiga a false ni un frame entre terminar los tiempos de viaje y arrancar
        // los sintéticos (esa caída causaba el parpadeo del overlay de carga).
        setLoadingTraces(new Set(res.estaciones.map(t => t.code)));
        setMessage('Tiempos de viaje calculados. Generando sismogramas…');
      }
    } catch (e) {
      setMessage(friendlyError(e, 'No se pudieron calcular los tiempos de viaje'));
      setTravelTimes([]);
      setLoadingTraces(new Set());
      if (!regenerate) setRealigning(false);
    } finally {
      if (regenerate) setLoadingTT(false);
    }
  }, []); // vp/vs/model se leen del ref (siempre frescos), no son deps del callback

  // Recalcular al colocar/cambiar epicentro: regenera sismogramas (nuevo sismo).
  useEffect(() => {
    if (epicenter) recomputeTravelTimes(epicenter, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [epicenter]);

  // REMOVED: auto-recompute on model change (UX issue - user expects manual control)
  // Users must click "Recalcular con estos valores" button to update travel times
  // when changing Vp, Vs, or density sliders.

  // ── Cargar sintéticos por estación, de forma INCREMENTAL ──
  // Cada estación actualiza `traces` y `loadingTraces` en cuanto termina, para
  // mostrar una barra de progreso real. Un `runId` garantiza que solo la última
  // generación escriba estado (evita que una carga vieja pise a la nueva).
  const runIdRef = useRef(0);
  // Estación que tiene datos reales MiniSEED activos. El useEffect de travelTimes
  // NO debe sobreescribir esta selección con la estación más cercana (sintético).
  const realStationRef = useRef<string | null>(null);

  const loadSynthetics = useCallback(async (tts: StationTravelTime[]) => {
    const runId = ++runIdRef.current;
    setLoadingTraces(new Set(tts.map(t => t.code)));

    // Limpiar las trazas SINTÉTICAS viejas (no las reales) para que la barra de
    // progreso parta de cero y se vea el recálculo. Sin esto, al pulsar
    // "Recalcular" las trazas previas seguían en `traces` → la barra saltaba al
    // 100% al instante y parecía que no pasaba nada. Se preservan las estaciones
    // con datos reales MiniSEED (realWave) para no perderlas.
    setTraces(prev => {
      const next: Record<string, SyntheticResult | null> = {};
      for (const code of Object.keys(prev)) {
        if (realWave[code]) next[code] = prev[code]; // conservar reales
      }
      return next;
    });
    rawTracesRef.current = {};
    // Errores capturados durante la generación (para avisar al usuario). Se
    // guarda el primero (p. ej. 429 o red caída) para mostrar un mensaje claro.
    let firstError: unknown = null;
    // Lanzar todas en paralelo, pero aplicar cada resultado en cuanto llega.
    await Promise.all(tts.map(async (tt) => {
      let syn: SyntheticResult | null = null;
      try {
        syn = await getSynthetic({
          vp: vp * 1000, vs: vs * 1000, density, magnitude, depth_km: depthKm,
          source_type: sourceType, distance_km: tt.distancia_hipocentral_km,
          nx: 160, nz: 120, dt_max_s: 0.02,
        });
      } catch (e) {
        syn = null;
        if (!firstError) firstError = e;
      }
      // Descartar si ya empezó otra generación (la última gana).
      if (runId !== runIdRef.current) return;
      // Guardar el crudo (para realinear al cambiar de modelo) y publicar la
      // versión alineada a los tP/tS de ESTA estación en el modelo activo.
      rawTracesRef.current[tt.code] = syn;
      const aligned = syn ? alignSyntheticToModel(syn, tt.tP, tt.tS) : null;
      setTraces(prev => ({ ...prev, [tt.code]: aligned }));
      setLoadingTraces(prev => {
        const next = new Set(prev);
        next.delete(tt.code);
        return next;
      });
    }));

    // Descartar si otra generación ya empezó.
    if (runId !== runIdRef.current) return;

    // Si hubo error y NINGUNA estación produjo señal, avisar al usuario con un
    // mensaje claro (429, red caída, etc.) en vez de dejar la barra "colgada".
    const generadas = tts.filter(tt => rawTracesRef.current[tt.code]).length;
    if (firstError && generadas === 0) {
      setLoadingTraces(new Set()); // detener la barra de progreso
      setMessage(friendlyError(firstError, 'No se pudieron generar los sismogramas'));
      return;
    }

    // Cuando termine de generar todos los sintéticos, abrir el panel triaxial.
    if (tts.length > 0) {
      setTimeout(() => {
        // Dejar una estación seleccionada (define el corte y el panel), pero NO
        // abrir el panel triaxial automáticamente: solo se muestra cuando el
        // usuario pulsa "Ver panel triaxial".
        if (realStationRef.current) {
          setSelectedStation(realStationRef.current);
        } else {
          setSelectedStation(current => {
            if (current) return current;
            const nearest = tts[0]?.code;
            return nearest || current;
          });
        }
      }, 200);
    }
  }, [vp, vs, density, magnitude, depthKm, sourceType, realWave]);

  useEffect(() => {
    if (travelTimes.length > 0) {
      if (shouldRegenerateRef.current) {
        // Nuevo sismo o cambio de Vp/Vs/magnitud…: regenerar desde el backend.
        loadSynthetics(travelTimes);
      } else if (Object.keys(rawTracesRef.current).length > 0) {
        // Solo cambió el modelo: NO se piden trazas nuevas. Se realinean las
        // crudas que ya tenemos a los tP/tS del nuevo modelo, en segundo plano,
        // sin tocar `elapsed` ni `playing` (la reproducción no se corta). Así la
        // onda P de cada traza vuelve a arrancar exactamente en el tP del modelo.
        setRealigning(true);
        setTraces(prev => {
          // CRÍTICO: Preservar datos reales existentes (no sintéticos)
          const next: Record<string, SyntheticResult | null> = { ...prev };
          for (const tt of travelTimes) {
            const raw = rawTracesRef.current[tt.code] ?? null;
            // Solo actualizar sintéticos, no tocar datos reales
            if (raw) {
              next[tt.code] = alignSyntheticToModel(raw, tt.tP, tt.tS);
            }
          }
          return next;
        });
        // El realineado es síncrono; el indicador se apaga en el próximo tick
        // para que sea visible sin bloquear la reproducción.
        setTimeout(() => setRealigning(false), 150);
      }
      // Seleccionar por defecto la estación más cercana (define el corte).
      // PERO si hay datos reales activos, respetar esa estación (no sobreescribir).
      if (realStationRef.current) {
        // Hay datos reales: asegurar que la estación real esté seleccionada
        selectStation(realStationRef.current);
      } else {
        const nearest = travelTimes[0]?.code;
        if (nearest && !selectedStation) {
          selectStation(nearest);
          // NO abrir el panel aquí, se abrirá en loadSynthetics cuando terminen de generarse
        }
      }
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
    realStationRef.current = code; // marcar estación real para que no se pise con sintético
    setSelectedStation(code);
    setUploadedStation(code);
    // NO abrir el panel aquí - se abrirá después de colocar epicentro y generar sintéticos
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
    setDepthAssumed(true); // epicentro manual: la profundidad es la que elige el usuario
    setCoordIsZone(false); // el usuario eligió la ubicación: no es un punto por zona
    autoplayPendingRef.current = true; // acción deliberada: autoplay al terminar
    setEpicenter({ lat, lon, depthKm });
    setCurrentEventId(null); // epicentro manual: sin registro real asociado
    setPlacingEpicenter(false); // ya se colocó: salir del modo "colocar"
    // CRÍTICO: NO borrar los datos reales si hay un archivo MiniSEED subido
    // (realStationRef marca la estación con datos reales). Colocar el epicentro
    // es para ver la propagación sintética SIN perder la traza real del usuario.
    if (!realStationRef.current) {
      resetRealState();
    }
    setElapsed(0);
    setPlaying(false);
  };

  const applyEvent = async (ev: CatalogEvent) => {
    setSourceType(ev.sourceType);
    setMagnitude(ev.magnitude);
    setDepthKm(ev.depthKm);
    setDepthAssumed(ev.depthAssumed); // el catálogo no trae profundidad real
    setCoordIsZone(ev.coordIsZone);   // ubicación por zona, no epicentro real
    if (ev.sourceType === 'volcanic') { setVp(3.0); setVs(1.7); setDensity(2500); }
    setLoadingTT(true); // loader inmediato (evita el parpadeo del estado vacío)
    autoplayPendingRef.current = true; // acción deliberada: autoplay al terminar
    setEpicenter({ lat: ev.lat, lon: ev.lon, depthKm: ev.depthKm });
    setCurrentEventId(ev.id);
    setPlacingEpicenter(false);
    
    // NO resetear el estado real aquí - lo hacemos después de verificar
    // si hay datos reales disponibles
    
    setElapsed(0);
    setPlaying(false);
    setShowEventList(false);
    setMessage(`Evento cargado: ${ev.label}`);
    setView('fit'); // transición de cámara suave al encuadre
    
    // Intentar cargar datos reales MiniSEED si están disponibles para este evento.
    let hasRealData = false;

    if (ev.mseedSource && ev.mseedStation && ev.mseedEventId) {
      try {
        const realData = await fetchEventWaveforms(ev.mseedEventId, ev.mseedSource, ev.mseedStation);
        if (realData) {
          hasRealData = true;
          const stationCode = realData.station;

          // Convertir al formato WaveformResult que usa el panel TriaxialTraces.
          const wf: WaveformResult = {
            event_id: ev.mseedEventId!,
            station: stationCode,
            t: realData.waveData.time,
            canales: {
              Z: realData.waveData.vertical,
              N: realData.waveData.north,
              E: realData.waveData.east,
            },
            fs: realData.sampling_rate ?? (realData.waveData.time.length > 1
              ? 1 / (realData.waveData.time[1] - realData.waveData.time[0])
              : 100),
            starttime_utc: ev.date,
            filtro: { freqmin: 1, freqmax: 10 },
          };

          setRealWave(prev => ({ ...prev, [stationCode]: wf }));
          setShowReal(prev => ({ ...prev, [stationCode]: true }));
          realStationRef.current = stationCode; // marcar como estación real activa
          setSelectedStation(stationCode);
          setStationDetail(traces[stationCode] ?? null);
          // NO abrir el panel triaxial automáticamente: el usuario lo abre con
          // el botón "Ver panel triaxial" cuando quiera.
        }
      } catch (error) {
        console.warn('[Map3D] No se pudieron cargar datos reales:', error);
      }
    }

    // SOLO resetear el estado real si NO se cargaron datos reales.
    if (!hasRealData) {
      realStationRef.current = null;
      resetRealState();
    }
  };

  // Al hacer clic en un evento de la lista, SIEMPRE pide confirmación (no carga
  // automáticamente). Si ya hay una generación en curso, la encola como pendiente.
  const loadEvent = (ev: CatalogEvent) => {
    setShowEventList(false);
    setPendingRequest({ kind: 'event', ev });
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

  // Mantener el detalle de la estación seleccionada en sincronía con la traza
  // activa: al realinear por un cambio de modelo, el panel triaxial y los tP/tS
  // mostrados deben reflejar la traza alineada, no una copia vieja.
  useEffect(() => {
    if (selectedStation) setStationDetail(traces[selectedStation] ?? null);
  }, [traces, selectedStation]);

  // GARANTÍA FINAL: cuando se cargan datos reales (realWave cambia) y el ref
  // apunta a una estación real, forzar que esa estación quede seleccionada
  // (para que, SI el usuario abre el panel, muestre la señal real). NO abre el
  // panel: solo mantiene la estación correcta seleccionada.
  useEffect(() => {
    const realCode = realStationRef.current;
    if (realCode && realWave[realCode] && selectedStation !== realCode) {
      setSelectedStation(realCode);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [realWave, selectedStation]);

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

  // Handler para el clic MANUAL del usuario en una estación. A diferencia de
  // selectStation (uso interno), este limpia realStationRef SOLO si el usuario
  // elige una estación distinta a la que tiene datos reales, para que el panel
  // muestre el sintético de esa otra estación sin que el sistema lo revierta.
  const handleUserSelectStation = (code: string) => {
    if (realStationRef.current && code !== realStationRef.current) {
      realStationRef.current = null; // el usuario eligió otra: liberar el "lock"
    }
    selectStation(code);
  };

  const fmtTime = (s: number) => {
    const m = Math.floor(s / 60);
    const ss = Math.floor(s % 60);
    const dec = Math.floor((s % 1) * 10);
    return `${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}.${dec}`;
  };

  // ── Reporte del Mapa 3D ──
  /**
   * Arma los datos del reporte con el estado actual (epicentro, tiempos, etc.).
   * `sceneViews` son las capturas de las vistas (Norte/Corte/Superior); si no se
   * pasan, se toma una sola captura de la escena como está (fallback).
   */
  const buildReportData = useCallback((sceneViews?: { label: string; image: string }[]): Map3dReportData | null => {
    if (!epicenter) return null;
    const ev = events.find(e => e.id === currentEventId) ?? null;
    const fecha = new Date().toISOString().slice(0, 10);
    const autoTitle = ev
      ? `Mapa 3D · ${ev.label}`
      : `Mapa 3D · ${epicenter.lat.toFixed(2)}, ${epicenter.lon.toFixed(2)} · ${fecha}`;
    // Usa el título personalizado si el usuario lo ingresó; de lo contrario, el auto-generado.
    const title = reportTitle.trim() || autoTitle;

    // Sismograma de la estación seleccionada (si hay y se pidió esa sección).
    // Si la estación tiene datos REALES (MiniSEED), se usan esos; si no, el
    // sintético FDM. El flag isReal marca el origen para el texto del reporte.
    const real = selectedStation ? realWave[selectedStation] : null;
    const syn = selectedStation ? traces[selectedStation] : null;
    let seismogram: Map3dReportData['seismogram'] = null;
    if (real && selectedStation) {
      seismogram = {
        station: selectedStation,
        t: real.t,
        north: real.canales.N ?? [],
        east: real.canales.E ?? [],
        vertical: real.canales.Z ?? [],
        tP: null, tS: null, // los datos reales no traen tP/tS calculados
        isReal: true,
      };
    } else if (syn && selectedStation) {
      seismogram = {
        station: selectedStation,
        t: syn.t, north: syn.north, east: syn.east, vertical: syn.vertical,
        tP: syn.tP_detectado, tS: syn.tS_detectado,
        isReal: false,
      };
    }

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
      // Capturas de las vistas (Norte/Corte/Superior) si se tomaron; si no, una
      // sola captura de la escena como está en pantalla.
      sceneViews: sceneViews && sceneViews.length > 0 ? sceneViews : null,
      sceneImage: sceneViews && sceneViews.length > 0 ? null : captureScene(),
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
  }, [epicenter, events, currentEventId, selectedStation, traces, user, magnitude, sourceType, model, vp, vs, density, travelTimes, captureScene, reportTitle]);

  /**
   * Descarga el reporte en el formato elegido y, como PROCESO INTERNO, lo
   * guarda en "Mis Reportes" (si hay sesión). El usuario no tiene que pulsar
   * "Guardar" aparte: con un solo clic en Descargar queda guardado y bajado.
   */
  const handleDownloadReport = async () => {
    // Para PDF con la sección "Vista 3D" activa, se capturan las tres vistas
    // (Norte/Corte/Superior) moviendo la cámara mientras corre el sismo. El CSV
    // y JSON no llevan imágenes, así que no se captura nada. Se captura UNA sola
    // vez y sirve tanto para el guardado como para la descarga.
    let views: { label: string; image: string }[] | undefined;
    if (reportFormat === 'pdf' && reportOpts.vista3d) {
      setCapturingViews(true);
      try { views = await captureAllViews(); }
      catch (e) { console.warn('[Map3D] No se pudieron capturar las vistas:', e); }
      finally { setCapturingViews(false); }
    }
    const data = buildReportData(views);
    if (!data) return;

    // Guardado INTERNO en "Mis Reportes" (solo si hay sesión y no se guardó ya).
    if (supabase && user && !reportSaved) {
      setSavingReport(true);
      setReportMsg(null);
      const { error } = await supabase.from('simulation_reports').insert({
        user_id: user.id,
        title: data.title,
        params: { sourceType, magnitude, depth: epicenter?.depthKm, model, vp, vs, density },
        results: { report_type: 'map3d', map3d: data, options: reportOpts },
      });
      setSavingReport(false);
      if (error) {
        setReportMsg('No se pudo guardar en «Mis Reportes» (la descarga continúa).');
        console.error('Guardar reporte Mapa 3D:', error.message);
      } else {
        setReportMsg('Guardado en «Mis Reportes».');
        setReportSaved(true);
      }
    }

    // Descarga en el formato elegido.
    if (reportFormat === 'pdf') downloadMap3dPdf(data, reportOpts);
    else if (reportFormat === 'json') downloadMap3dJson(data, reportOpts);
    else downloadMap3dCsv(data, reportOpts);
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
  // Durante el cálculo de tiempos de viaje mostramos 5% para dar feedback inmediato.
  // Una vez calculados, el % refleja las estaciones completadas (5%-100%).
  const genPercent = loadingTT 
    ? 5 
    : genTotal > 0 
      ? Math.max(5, Math.round((genDone / genTotal) * 100)) 
      : 0;
  // Paso actual: primero los tiempos de viaje; luego la estación más cercana que
  // aún está en cola (loadingTraces conserva las pendientes en orden de distancia).
  const nextPending = travelTimes.find(tt => loadingTraces.has(tt.code));
  const genStepLabel = loadingTT
    ? 'Calculando tiempos de viaje…'
    : nextPending
      ? `Generando estación ${nextPending.code}${nextPending.name ? `, ${nextPending.name}` : ''}…`
      : 'Preparando la reproducción…';

  // Al terminar de generar, arrancar la reproducción automáticamente SOLO si el
  // cálculo vino de colocar un epicentro o cargar un evento (acción deliberada
  // de "nuevo sismo"). Un recálculo por cambiar el modelo (Velocidad constante /
  // IASP91) o Vp/Vs NO debe arrancar la animación sola.
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
      // Autoplay solo si estaba pendiente por una acción del usuario.
      if (autoplayPendingRef.current) {
        autoplayPendingRef.current = false;
        setElapsed(0);
        const play = setTimeout(() => setPlaying(true), 600);
        return () => clearTimeout(play);
      }
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
    ? loadedEvent.label.split(' · ').slice(1).join(', ') + (coordIsZone ? ' (ubicación por zona, no epicentro)' : '')
    : `${epicenter?.lat.toFixed(2)}°, ${epicenter?.lon.toFixed(2)}°`;
  const currentEventTitle = epicenter
    ? [
        eventWhere,
        `${magType} ${magnitude.toFixed(1)}`,
        depthAssumed ? `Prof. ${epicenter.depthKm} km (asumida, no está en el catálogo)` : `Prof. ${epicenter.depthKm} km`,
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
          <h1 className="text-sm font-bold text-stone-100 flex items-center gap-2 min-w-0">
            <span className="text-[#C4553A] shrink-0">◉</span>
            <span className="truncate">Mapa 3D de propagación de ondas en Nariño</span>
            {/* Botón de ayuda, pegado al título: repite el tour guiado. */}
            <Tooltip content="Ver guía" hoverOnly>
              <button
                type="button"
                onClick={launchTour}
                aria-label="Ver guía"
                className={`shrink-0 flex items-center justify-center w-8 h-8 rounded-full border border-white/25 bg-white/10 text-stone-100 hover:text-white hover:bg-[#C4553A] hover:border-[#C4553A] transition-colors ${user && !user.tours_vistos?.mapa3d ? 'help-pulse' : ''}`}
              >
                <HelpCircle size={16} />
              </button>
            </Tooltip>
          </h1>
          <div className="flex items-center gap-3">
            <span className="text-[11px] text-stone-400 hidden md:inline">{currentEventTitle}</span>
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
            {/* Indicador pequeño al realinear por cambio de modelo (no corta la
                reproducción, a diferencia del overlay de generación). */}
            {realigning && !isCalculating && (
              <span className="flex items-center gap-1 text-[9px] text-[#D4A853]">
                <Loader size={9} className="animate-spin" /> Ajustando al modelo…
              </span>
            )}
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
                        className="w-full flex items-center justify-center bg-[#C4553A] text-white text-[12px] font-bold py-2.5 rounded-lg"
                      >
                        Cargar un evento
                      </button>
                      <button
                        onClick={() => { setPlacingEpicenter(true); setView('top'); }}
                        className={`w-full flex items-center justify-center text-[12px] font-bold py-2.5 rounded-lg border transition-colors ${
                          placingEpicenter
                            ? 'bg-[#2D6A4F]/20 border-[#2D6A4F] text-[#8fd3b4]'
                            : 'bg-white/5 border-white/15 text-stone-200'
                        }`}
                      >
                        Colocar epicentro en el mapa
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
                onSelectStation={handleUserSelectStation}
              />
            </div>
          )}
        </div>

        {/* ── CENTRO: Escena 3D ── */}
        <div
          ref={sceneContainerRef}
          data-tour="m3d-escena"
          className={`relative bg-black/30 rounded-xl overflow-hidden min-h-[440px] sm:min-h-[520px] lg:min-h-[640px] transition-all ${
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
            onSelectStation={handleUserSelectStation}
            onPlaceEpicenter={placeEpicenter}
          />
          <Legend scaleBar={sceneGeometry?.scale_bar ?? null} domainWidthKm={sceneGeometry?.domain_width_km ?? null} depthRamp={depthRamp} />
          {/* Ayuda superior. En móvil se acorta el texto para no tapar la escena. */}
          <div data-tour="m3d-hint" className={`absolute top-2 left-2 z-10 max-w-[70%] sm:max-w-[60%] text-[10px] leading-snug rounded px-2 py-1 transition-colors ${
            placingEpicenter ? 'text-white bg-[#2D6A4F]/80 font-semibold' : 'text-stone-400 bg-black/40'
          }`}>
            {placingEpicenter ? (
              'Haz clic en el terreno para colocar el epicentro'
            ) : (
              <>
                {/* Versión corta en móvil, completa en pantallas grandes. */}
                <span className="sm:hidden">Toca el terreno para el epicentro; ▲ para una estación.</span>
                <span className="hidden sm:inline">Clic en el terreno para colocar el epicentro, clic en ▲ para seleccionar una estación</span>
              </>
            )}
          </div>
          {/* Nota del modelo homogéneo. Se oculta en móvil (secundaria) para no
              apilar texto sobre la escena; visible desde sm. */}
          {model === 'homogeneous' && (
            <div className="hidden sm:block absolute top-12 left-2 z-10 max-w-[220px] text-[10px] leading-snug text-stone-300 bg-black/45 rounded px-2 py-1">
              En este modelo todo el subsuelo tiene la misma velocidad.
            </div>
          )}
          {/* Aviso cuando hay un MiniSEED subido asociado a una estación: su traza
              es dato real, pero el epicentro es un supuesto del usuario. */}
          {uploadedStation && (
            <div className="absolute top-2 right-2 z-10 max-w-[40%] sm:max-w-[260px] text-[10px] text-stone-200 bg-[#C4553A]/80 rounded px-2.5 py-1.5 leading-snug">
              Registro cargado por ti en <b>{uploadedStation}</b>. Su traza es real; el
              <b> epicentro que coloques es un supuesto</b> para ver la propagación.
            </div>
          )}
          {/* Botones de vista de cámara en la esquina INFERIOR IZQUIERDA del
              visor, para no tapar la frase de ayuda superior. El panel triaxial
              (cuando está abierto) ocupa la franja inferior; por eso se suben
              con bottom-16 si hay estación seleccionada y panel visible. */}
          <div
            data-tour="m3d-vistas"
            className={`absolute left-2 z-20 flex gap-1.5 ${showTriaxial && selectedStation ? 'bottom-16' : 'bottom-2'}`}
          >
            {([
              ['north', 'Norte', 'Mira el bloque de frente, desde el norte (ves la superficie y la profundidad).'],
              ['cut', 'Corte', 'Corte vertical hacia la estación seleccionada: muestra cómo baja la onda con la profundidad.'],
              ['top', 'Superior', 'Vista desde arriba, como un mapa: ubica el epicentro y las estaciones.'],
            ] as const).map(([v, label, help]) => (
              <Tooltip key={v} content={help} hoverOnly>
                <button
                  onClick={() => setView(v)}
                  className="text-[10px] font-bold px-2.5 py-1.5 rounded-lg bg-black/60 border border-white/15 text-stone-200 hover:bg-black/80"
                >
                  {label}
                </button>
              </Tooltip>
            ))}
          </div>

          {/* Panel triaxial desplegable (N/E/Z con tP/tS) */}
          {showTriaxial && selectedStation && (() => {
            // ROBUSTO: una estación muestra señal REAL si tiene datos en realWave,
            // sin depender del flag showReal (que puede llegar con retraso por el
            // timing async). Si realWave[selectedStation] existe → es real.
            const hasRealForSelected = !!realWave[selectedStation];
            return (
            <div className="absolute bottom-0 left-0 right-0 z-10 bg-black/70 backdrop-blur-sm border-t border-white/10 p-3">
              <div className="flex items-center justify-between mb-1">
                <div className="flex flex-col gap-0.5">
                  <span className="text-[11px] font-bold text-stone-200">
                    Panel triaxial, {selectedStation}, {hasRealForSelected ? 'señal real (1 a 10 Hz)' : 'sintético FDM'}
                  </span>
                  {!hasRealForSelected && (
                    <span className="text-[9px] text-[#D4A853] leading-tight">
                      Sismograma sintético generado con Diferencias Finitas. No coincide con datos reales MiniSEED.
                    </span>
                  )}
                </div>
                <button onClick={() => setShowTriaxial(false)} aria-label="Cerrar panel triaxial" title="Cerrar" className="text-stone-400 flex-shrink-0"><X size={14} /></button>
              </div>
              <TriaxialTraces
                syn={traces[selectedStation] ?? null}
                real={hasRealForSelected ? realWave[selectedStation] ?? null : null}
              />
            </div>
            );
          })()}
        </div>

        {/* ── DERECHA: Controles ── */}
        <div data-tour="m3d-controles" className={`bg-black/30 rounded-xl border border-white/10 p-3 space-y-3 ${panelsCollapsed ? 'hidden' : ''}`}>
          {/* Transporte: botón Reproducir a ANCHO COMPLETO (su texto nunca se
              corta) y, al lado, el botón de reiniciar como ícono. */}
          <div data-tour="m3d-transporte">
            <h2 className="text-xs font-bold text-stone-200 mb-2">Controles</h2>
            <Tooltip
              content={
                isCalculating
                  ? 'Espera a que terminen de generarse los sismogramas.'
                  : 'Coloca un epicentro o carga un evento primero.'
              }
              hoverOnly
              disabled={canPlay}
              className="w-full"
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
            <ParamSlider label="Prof." value={depthKm} min={0.1} max={200} step={0.1} unit="km" onChange={(v) => { setDepthKm(v); setDepthAssumed(false); }} />
            {depthAssumed && currentEventId && (
              <p className="text-[10px] text-[#D4A853] leading-snug -mt-1">
                Profundidad no disponible en el catálogo; se usa {depthKm} km para la simulación.
              </p>
            )}
            <Tooltip
              content="Coloca un epicentro o carga un evento primero."
              hoverOnly
              disabled={!!epicenter}
              className="w-full"
              block
            >
              <button
                onClick={() => {
                  if (!epicenter) return;
                  // Aplicar la profundidad del slider al epicentro y recalcular.
                  // Mutar el epicentro dispara el useEffect([epicenter]) que llama
                  // a recomputeTravelTimes; si la profundidad no cambió, se llama
                  // aquí directo para que el botón siempre regenere.
                  if (epicenter.depthKm !== depthKm) {
                    setEpicenter({ ...epicenter, depthKm });
                  } else {
                    recomputeTravelTimes(epicenter);
                  }
                }}
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
                onClick={() => { setReportMsg(null); setReportSaved(false); setReportTitle(''); setShowReport(true); }}
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
                type="text" placeholder="Buscar por fecha o región…" value={evFilters.search ?? ''}
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
                  <option value="all" className="text-black bg-white">Región: todas</option>
                  <option value="Colombia" className="text-black bg-white">Colombia</option>
                  <option value="Ecuador" className="text-black bg-white">Ecuador</option>
                </select>
                {/* Tipo */}
                <select
                  value={evFilters.type ?? 'all'}
                  onChange={e => setEvFilters(f => ({ ...f, type: e.target.value as EventFilters['type'] }))}
                  className="text-[11px] px-2 py-1.5 rounded-lg bg-white/5 border border-white/10 text-stone-200"
                >
                  <option value="all" className="text-black bg-white">Tipo: todos</option>
                  <option value="tectonic" className="text-black bg-white">Tectónico</option>
                  <option value="volcanic" className="text-black bg-white">Volcánico</option>
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
                    <option key={d.id} value={d.id} className="text-black bg-white">{d.id === 'all' ? 'Profundidad: todas' : d.label}</option>
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
              {pagedRows.map(row => {
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
            {/* Paginación fija al pie del modal (fuera del área con scroll). */}
            {filteredRows.length > 0 && (
              <div className="px-4 py-2.5 border-t border-white/10">
                <Pagination
                  page={evPage}
                  totalItems={filteredRows.length}
                  pageSize={EVENTS_PER_PAGE}
                  onChange={setEvPage}
                  theme="dark"
                />
              </div>
            )}
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
              {/* Título personalizado */}
              <div>
                <label className="text-[11px] font-semibold text-stone-300 mb-1.5 block">Título del reporte</label>
                <input
                  type="text"
                  value={reportTitle}
                  onChange={e => { setReportTitle(e.target.value); setReportSaved(false); }}
                  placeholder={
                    events.find(e => e.id === currentEventId)
                      ? `Mapa 3D · ${events.find(e => e.id === currentEventId)?.label}`
                      : `Mapa 3D · ${epicenter?.lat.toFixed(2)}, ${epicenter?.lon.toFixed(2)} · ${new Date().toISOString().slice(0, 10)}`
                  }
                  className="w-full px-2.5 py-2 text-[11px] rounded-lg bg-white/5 border border-white/10 text-stone-200 placeholder:text-stone-600 focus:outline-none focus:border-[#2D6A4F]"
                />
                <p className="text-[9px] text-stone-500 mt-1">Opcional. Si está vacío, se usa el título automático.</p>
              </div>

              {/* Formato */}
              <div>
                <div className="text-[11px] font-semibold text-stone-300 mb-1">Formato</div>
                <div className="flex gap-1.5">
                  {(['json', 'csv', 'pdf'] as const).map(f => (
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
                <p className="text-[9px] text-stone-500 mt-1.5">
                  {reportFormat === 'json' && 'Datos completos en formato JSON: epicentro, parámetros, tiempos de viaje, sismogramas y metadatos.'}
                  {reportFormat === 'csv' && 'Tabla de tiempos de viaje por estación en formato CSV (compatible con Excel).'}
                  {reportFormat === 'pdf' && 'Documento completo con las secciones seleccionadas abajo.'}
                </p>
              </div>

              {/* Qué incluir (solo para PDF) */}
              {reportFormat === 'pdf' && (
              <div>
                <div className="text-[11px] font-semibold text-stone-300 mb-2">¿Qué incluir en el PDF?</div>
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
              )}

              {reportMsg && (
                <div className="text-[10px] text-[#2D6A4F] bg-[#2D6A4F]/10 rounded-lg px-2.5 py-1.5 border border-[#2D6A4F]/20">
                  {reportMsg}
                </div>
              )}

              {/* Acción única: Descargar. El guardado en "Mis Reportes" es un
                  proceso INTERNO (ocurre solo al descargar, si hay sesión); el
                  usuario no pulsa "Guardar" aparte. */}
              <div className="space-y-2 pt-1">
                <button
                  onClick={handleDownloadReport}
                  disabled={capturingViews || savingReport}
                  className="w-full flex items-center justify-center gap-1.5 bg-[#C4553A] text-white text-[12px] font-bold py-2.5 rounded-lg disabled:opacity-60"
                >
                  {capturingViews
                    ? <><Loader size={13} className="animate-spin" /> Capturando vistas…</>
                    : savingReport
                      ? <><Loader size={13} className="animate-spin" /> Guardando…</>
                      : <><FileDown size={13} /> Descargar {reportFormat.toUpperCase()}</>}
                </button>
                <p className="text-[10px] text-stone-500 text-center">
                  {user
                    ? 'Al descargar, el reporte se guarda en «Mis Reportes».'
                    : 'Inicia sesión para guardar también el reporte en «Mis Reportes».'}
                </p>
              </div>
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

  // Fin ÚTIL de la señal: el registro puede durar más que la señal (p. ej. 120 s
  // de ventana con energía hasta ~72 s), dejando media sección vacía. El eje se
  // recorta al último instante con amplitud significativa (≥1% del máximo) en
  // cualquier componente, más un 8% de margen, para que la traza llene el ancho.
  const tMax = (() => {
    const fullT = comps[0].t[comps[0].t.length - 1] || 1;
    let lastSignalT = 0;
    for (const c of comps) {
      let maxAbs = 1e-9;
      for (const v of c.data) maxAbs = Math.max(maxAbs, Math.abs(v));
      const thr = maxAbs * 0.01;
      for (let i = c.data.length - 1; i >= 0; i--) {
        if (Math.abs(c.data[i]) >= thr) { lastSignalT = Math.max(lastSignalT, c.t[i]); break; }
      }
    }
    // Asegurar que se vea al menos hasta S (si existe) y no recortar de más.
    const floor = Math.max(tS ?? 0, lastSignalT) * 1.08;
    const capped = floor > 0 ? Math.min(fullT, floor) : fullT;
    return Math.max(1, capped);
  })();

  const path = (data: number[], t: number[]) => {
    let maxAbs = 1e-9;
    for (const v of data) maxAbs = Math.max(maxAbs, Math.abs(v));
    const pts: string[] = [];
    const step = Math.max(1, Math.floor(data.length / w));
    for (let i = 0; i < data.length; i += step) {
      if (t[i] > tMax) break; // no dibujar más allá del eje recortado
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
      {/* Rango: valor mínimo (inicio) y máximo (fin) de la barra. */}
      <div className="flex justify-between text-[8px] text-stone-500 leading-none px-0.5">
        <span>{min} {unit}</span>
        <span>{max} {unit}</span>
      </div>
    </div>
  );
}
