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
import { loadCatalog } from '../lib/catalog';
import { useAuth } from '../lib/auth';
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

/** Página principal del Mapa 3D. */
export function Map3D() {
  // Datos base
  const [stations, setStations] = useState<Station[]>([]);
  const [events, setEvents] = useState<CatalogEvent[]>([]);
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
  const [evSearch, setEvSearch] = useState('');
  const [evMinMag, setEvMinMag] = useState('');
  const [evYear, setEvYear] = useState('');
  const [evSort, setEvSort] = useState<'date' | 'magnitude'>('date');
  const [panelsCollapsed, setPanelsCollapsed] = useState(false);

  // Eventos filtrados y ordenados para la lista "Cargar evento".
  const filteredEvents = useMemo(() => {
    let list = [...events];
    if (evSearch) {
      const q = evSearch.toLowerCase();
      list = list.filter(e => e.label.toLowerCase().includes(q) || e.date.includes(q));
    }
    if (evMinMag) { const m = Number(evMinMag); if (!isNaN(m)) list = list.filter(e => e.magnitude >= m); }
    if (evYear) list = list.filter(e => e.date.startsWith(evYear));
    list.sort((a, b) => evSort === 'magnitude' ? b.magnitude - a.magnitude : b.date.localeCompare(a.date));
    return list;
  }, [events, evSearch, evMinMag, evYear, evSort]);

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
      .catch((e: ApiError) => setMessage(e.message));

    // Silueta de Nariño para el mapa del reporte PDF (mismo polígono del 3D).
    loadNarinoRing().then(ring => { narinoRingRef.current = ring; }).catch(() => {});

    // Geometría de escena calculada por el backend. Si falla, Scene3D usa el
    // fallback local de domain.ts (regla: el cálculo vive en el backend).
    getSceneGeometry()
      .then(setSceneGeometry)
      .catch(() => setSceneGeometry(null));

    async function loadEvents() {
      const catalog = await loadCatalog();
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
      setMessage(`Listo (${res.modelo_usado}). Presiona reproducir.`);
    } catch (e) {
      const err = e as ApiError;
      setMessage(err.status === 0 ? 'Backend no disponible en :8000' : `Error: ${err.message}`);
      setTravelTimes([]);
    } finally {
      setLoadingTT(false);
    }
  }, [vp, vs, model]);

  useEffect(() => {
    if (epicenter) recomputeTravelTimes(epicenter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [epicenter, model]);

  // ── Cargar sintéticos por estación en PARALELO (Promise.all) ──
  // Usa la distancia hipocentral de cada estación. Marca las trazas como
  // "cargando" (null en `traces` + código en `loadingTraces`) para el spinner.
  const [loadingTraces, setLoadingTraces] = useState<Set<string>>(new Set());

  const loadSynthetics = useCallback(async (tts: StationTravelTime[]) => {
    setLoadingTraces(new Set(tts.map(t => t.code)));
    setTraces({}); // limpiar previos para evitar trazas viejas
    const results = await Promise.all(tts.map(async (tt) => {
      try {
        const syn = await getSynthetic({
          vp: vp * 1000, vs: vs * 1000, density, magnitude, depth_km: depthKm,
          source_type: sourceType, distance_km: tt.distancia_hipocentral_km,
          nx: 160, nz: 120, dt_max_s: 0.02,
        });
        return [tt.code, syn] as const;
      } catch {
        return [tt.code, null] as const;
      }
    }));
    const updates: Record<string, SyntheticResult | null> = {};
    for (const [code, syn] of results) updates[code] = syn;
    setTraces(updates);
    setLoadingTraces(new Set());
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

  const placeEpicenter = (lat: number, lon: number) => {
    setEpicenter({ lat, lon, depthKm });
    setCurrentEventId(null); // epicentro manual: sin registro real asociado
    resetRealState();
    setElapsed(0);
    setPlaying(false);
  };

  const loadEvent = (ev: CatalogEvent) => {
    setSourceType(ev.sourceType);
    setMagnitude(ev.magnitude);
    setDepthKm(ev.depthKm);
    if (ev.sourceType === 'volcanic') { setVp(3.0); setVs(1.7); setDensity(2500); }
    setEpicenter({ lat: ev.lat, lon: ev.lon, depthKm: ev.depthKm });
    setCurrentEventId(ev.id);
    resetRealState();
    setElapsed(0);
    setPlaying(false);
    setShowEventList(false);
    setMessage(`Evento cargado: ${ev.label}`);
    setView('fit'); // transición de cámara suave al encuadre
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
        if (err.status !== 404) setMessage(`Sin señal real: ${err.message}`);
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
      setReportMsg('¡Guardado! Míralo en "Mis Reportes".');
    }
    setSavingReport(false);
  };

  // Nº de estaciones con señal (sintético o real) para el título.
  const stationsWithSignal = travelTimes.filter(tt => traces[tt.code]).length;

  // ¿Sigue calculando? True mientras se resuelven tiempos de viaje o mientras
  // queda alguna traza sintética por generar. Con esto bloqueamos "Reproducir"
  // y mostramos un aviso de carga, para que no se reproduzca sin ondas.
  const isCalculating = loadingTT || loadingTraces.size > 0;
  // Hay epicentro pero todavía ninguna traza lista (aún generando la primera).
  const noSignalYet = !!epicenter && travelTimes.length > 0 && stationsWithSignal === 0;
  const canPlay = !!epicenter && !isCalculating && stationsWithSignal > 0;

  const loadedEvent = events.find(e => e.id === currentEventId) ?? null;
  const magType = sourceType === 'volcanic' ? 'Md' : 'Ml';
  const currentEventTitle = epicenter
    ? [
        loadedEvent ? loadedEvent.label.split(' · ').slice(1).join(' · ') : `${epicenter.lat.toFixed(2)}°, ${epicenter.lon.toFixed(2)}°`,
        `${magType} ${magnitude.toFixed(1)}`,
        `Prof. ${epicenter.depthKm} km`,
        `${stationsWithSignal}/${travelTimes.length} estaciones con señal`,
      ].join('  ·  ')
    : 'Sin evento seleccionado';

  return (
    <div className="min-h-screen bg-[#0a0e1a] pt-16 text-stone-200">
      {/* Barra superior */}
      <div className="border-b border-white/10 px-4 py-2.5">
        <div className="max-w-[1600px] mx-auto flex items-center justify-between">
          <h1 className="font-mono text-sm font-bold tracking-wide text-stone-100 flex items-center gap-2">
            <span className="text-[#C4553A]">◉</span> MAPA 3D — Propagación de Ondas · Nariño
          </h1>
          <div className="flex items-center gap-3">
            <span className="font-mono text-[11px] text-stone-400 hidden md:inline">{currentEventTitle}</span>
            {/* Botón de ayuda: repite el tour guiado cuando el usuario quiera. */}
            <Tooltip content="Ver guía">
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
              className="font-mono text-[10px] font-bold px-2 py-1 rounded-lg bg-white/5 border border-white/10 text-stone-300"
              title="Mostrar/ocultar paneles laterales"
            >
              {panelsCollapsed ? 'Mostrar paneles' : 'Ocultar paneles'}
            </button>
          </div>
        </div>
      </div>

      <div className={`max-w-[1600px] mx-auto grid grid-cols-1 gap-3 p-3 ${
        panelsCollapsed ? 'lg:grid-cols-1' : 'lg:grid-cols-[320px_1fr_300px]'
      }`}>
        {/* ── IZQUIERDA: Sismogramas ── */}
        <div data-tour="m3d-sismogramas" className={`bg-black/30 rounded-xl border border-white/10 p-3 ${panelsCollapsed ? 'hidden' : ''}`}>
          <div className="flex items-center gap-2 mb-2">
            <Radio size={13} className="text-[#C4553A]" />
            <h2 className="font-mono text-xs font-bold text-stone-200">SISMOGRAMAS</h2>
            {isCalculating && travelTimes.length > 0 && (
              <span className="flex items-center gap-1 font-mono text-[9px] text-[#eab308]">
                <Loader size={9} className="animate-spin" /> generando…
              </span>
            )}
            <span className="font-mono text-[10px] text-stone-500 ml-auto">por distancia →</span>
          </div>
          {travelTimes.length === 0 ? (
            <div className="flex items-center justify-center h-[520px] text-center px-4">
              <p className="font-mono text-[11px] text-stone-500">
                {loadingTT
                  ? 'Calculando tiempos de viaje…'
                  : 'Coloca un epicentro o carga un evento para ver los sismogramas.'}
              </p>
            </div>
          ) : (
            <div className="relative">
              <RecordSection
                stations={travelTimes}
                traces={traces}
                loadingTraces={loadingTraces}
                elapsed={elapsed}
                maxTime={maxTime}
                selectedStation={selectedStation}
                onSelectStation={selectStation}
              />
              {/* Aviso de carga: mientras aún no hay ninguna traza lista, cubre
                  el panel para que quede claro que se están generando y que no
                  tiene sentido reproducir todavía. */}
              {noSignalYet && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#0a0e1a]/70 backdrop-blur-[1px] rounded-lg">
                  <Loader size={22} className="animate-spin text-[#C4553A] mb-2" />
                  <p className="font-mono text-[11px] text-stone-300">Generando sismogramas…</p>
                  <p className="font-mono text-[9px] text-stone-500 mt-1">Espera un momento para reproducir</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── CENTRO: Escena 3D ── */}
        <div ref={sceneContainerRef} data-tour="m3d-escena" className="relative bg-black/30 rounded-xl border border-white/10 overflow-hidden min-h-[560px]">
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
            onSelectStation={selectStation}
            onPlaceEpicenter={placeEpicenter}
          />
          <Legend scaleBar={sceneGeometry?.scale_bar ?? null} domainWidthKm={sceneGeometry?.domain_width_km ?? null} depthRamp={depthRamp} />
          <div data-tour="m3d-hint" className="absolute top-2 left-2 z-10 font-mono text-[10px] text-stone-400 bg-black/40 rounded px-2 py-1">
            clic en el terreno = colocar epicentro · clic en ▲ = seleccionar estación
          </div>
          {/* Botones de vista de cámara */}
          <div data-tour="m3d-vistas" className="absolute bottom-3 left-3 z-10 flex gap-1.5 font-mono">
            {([['north', 'Norte'], ['cut', 'Corte'], ['top', 'Superior']] as const).map(([v, label]) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className="text-[10px] font-bold px-2.5 py-1.5 rounded-lg bg-black/50 border border-white/15 text-stone-200 hover:bg-black/70"
              >
                {label}
              </button>
            ))}
          </div>

          {/* Panel triaxial desplegable (N/E/Z con tP/tS) */}
          {showTriaxial && selectedStation && (
            <div className="absolute bottom-0 left-0 right-0 z-10 bg-black/70 backdrop-blur-sm border-t border-white/10 p-3">
              <div className="flex items-center justify-between mb-1">
                <span className="font-mono text-[11px] font-bold text-stone-200">
                  Panel triaxial · {selectedStation} · {showReal[selectedStation] ? 'señal real (1–10 Hz)' : 'sintético FDM'}
                </span>
                <button onClick={() => setShowTriaxial(false)} className="text-stone-400"><X size={14} /></button>
              </div>
              <TriaxialTraces
                syn={traces[selectedStation] ?? null}
                real={showReal[selectedStation] ? realWave[selectedStation] ?? null : null}
              />
            </div>
          )}
        </div>

        {/* ── DERECHA: Controles ── */}
        <div data-tour="m3d-controles" className={`bg-black/30 rounded-xl border border-white/10 p-3 space-y-3 font-mono ${panelsCollapsed ? 'hidden' : ''}`}>
          {/* Transporte */}
          <div data-tour="m3d-transporte">
            <h2 className="text-xs font-bold text-stone-200 mb-2">CONTROLES</h2>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPlaying(p => !p)}
                disabled={!canPlay}
                title={isCalculating ? 'Espera a que terminen de generarse los sismogramas' : undefined}
                className="flex-1 flex items-center justify-center gap-1.5 bg-[#C4553A] text-white text-xs font-bold py-2 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isCalculating ? (
                  <><Loader size={13} className="animate-spin" /> Generando…</>
                ) : (
                  <>{playing ? <Pause size={13} /> : <Play size={13} />}{playing ? 'Pausar' : 'Reproducir'}</>
                )}
              </button>
              <button onClick={reset} className="p-2 rounded-lg bg-white/5 border border-white/10 text-stone-300">
                <RotateCcw size={13} />
              </button>
            </div>
          </div>

          {/* Message */}
          <div className="bg-black/40 rounded-lg px-2.5 py-2 border border-white/10">
            <div className="text-[9px] text-stone-500 uppercase">message</div>
            <div className="text-[10px] text-stone-300 flex items-center gap-1.5 mt-0.5">
              {loadingTT && <Loader size={10} className="animate-spin" />}
              {message.includes('Backend no disponible') && <AlertCircle size={10} className="text-red-400" />}
              <span>{message}</span>
            </div>
          </div>

          {/* Elapsed + speed */}
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-black/40 rounded-lg px-2.5 py-2 border border-white/10">
              <div className="text-[9px] text-stone-500 uppercase">elapsed time</div>
              <div className="text-sm text-[#eab308] font-bold">{fmtTime(elapsed)}</div>
            </div>
            <div className="bg-black/40 rounded-lg px-2.5 py-2 border border-white/10">
              <div className="text-[9px] text-stone-500 uppercase">speed</div>
              <div className="text-sm text-stone-200 font-bold">{speed}×</div>
            </div>
          </div>
          <div data-tour="m3d-velocidad" className="flex gap-1.5">
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

          {/* Modelo de tiempos */}
          <div data-tour="m3d-modelo">
            <div className="text-[9px] text-stone-500 uppercase mb-1">modelo de tiempos</div>
            <div className="flex gap-1.5">
              {(['homogeneous', 'iasp91'] as TravelModel[]).map(m => (
                <button
                  key={m}
                  onClick={() => setModel(m)}
                  className={`flex-1 text-[10px] font-bold py-1.5 rounded-lg border ${
                    model === m ? 'bg-[#2D6A4F] text-white border-[#2D6A4F]' : 'bg-white/5 text-stone-400 border-white/10'
                  }`}
                >
                  {m === 'homogeneous' ? 'Homogéneo' : 'IASP91'}
                </button>
              ))}
            </div>
          </div>

          {/* Cargar evento */}
          <button
            data-tour="m3d-evento"
            onClick={() => setShowEventList(s => !s)}
            className="w-full flex items-center justify-center gap-1.5 bg-white/5 border border-white/10 text-stone-200 text-xs font-bold py-2 rounded-lg"
          >
            <List size={13} /> Cargar evento ({events.length})
          </button>

          {/* Panel reducido de parámetros (estética oscura) */}
          <div className="border-t border-white/10 pt-2 space-y-2">
            <div className="text-[9px] text-stone-500 uppercase">parámetros del medio</div>
            <ParamSlider label="Vp" value={vp} min={1} max={8} step={0.1} unit="km/s" onChange={setVp} />
            <ParamSlider label="Vs" value={vs} min={0.5} max={5} step={0.1} unit="km/s" onChange={setVs} />
            <ParamSlider label="ρ" value={density} min={1800} max={3300} step={50} unit="kg/m³" onChange={setDensity} />
            <ParamSlider label="Prof." value={depthKm} min={0} max={200} step={1} unit="km" onChange={(v) => { setDepthKm(v); if (epicenter) setEpicenter({ ...epicenter, depthKm: v }); }} />
            <button
              onClick={() => epicenter && recomputeTravelTimes(epicenter)}
              disabled={!epicenter}
              className="w-full text-[10px] font-bold py-1.5 rounded-lg bg-white/5 border border-white/10 text-stone-300 disabled:opacity-40"
            >
              Recalcular con estos valores
            </button>
            {/* Generar reporte del Mapa 3D (PDF/CSV, con opciones). */}
            <button
              onClick={() => { setReportMsg(null); setShowReport(true); }}
              disabled={!epicenter || travelTimes.length === 0}
              title={!epicenter ? 'Coloca un epicentro primero' : undefined}
              className="w-full flex items-center justify-center gap-1.5 text-[10px] font-bold py-1.5 rounded-lg bg-[#2D6A4F] text-white disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <FileDown size={12} /> Generar reporte
            </button>
          </div>

          {/* Detalle de estación seleccionada */}
          {selectedStation && stationDetail && (
            <div className="border-t border-white/10 pt-2 space-y-2">
              <div className="text-[9px] text-stone-500 uppercase">estación {selectedStation}</div>
              <div className="text-[10px] text-stone-300 space-y-0.5">
                <div>tP: {stationDetail.tP_detectado.toFixed(2)} s · tS: {stationDetail.tS_detectado.toFixed(2)} s</div>
                <div className="text-stone-500">malla {stationDetail.nx}×{stationDetail.nz} · {stationDetail.tiempo_computo_ms.toFixed(0)} ms · CFL {stationDetail.cfl_ok ? 'ok' : 'ajustado'}</div>
              </div>
              {/* Botón real / sintético */}
              <button
                onClick={() => toggleReal(selectedStation)}
                disabled={realAvailable[selectedStation] === false}
                title={realAvailable[selectedStation] === false ? 'sin registro para este evento' : 'alternar señal real / sintética'}
                className={`w-full text-[10px] font-bold py-1.5 rounded-lg border ${
                  realAvailable[selectedStation] === false
                    ? 'bg-white/5 text-stone-600 border-white/10 cursor-not-allowed'
                    : showReal[selectedStation]
                      ? 'bg-[#2D6A4F] text-white border-[#2D6A4F]'
                      : 'bg-white/5 text-stone-300 border-white/10'
                }`}
              >
                {showReal[selectedStation] ? 'Mostrando: real' : 'Mostrar señal real'}
              </button>
              <button
                onClick={() => setShowTriaxial(v => !v)}
                className="w-full text-[10px] font-bold py-1.5 rounded-lg bg-white/5 border border-white/10 text-stone-300"
              >
                {showTriaxial ? 'Ocultar panel triaxial' : 'Ver panel triaxial (N/E/Z)'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Modal lista de eventos */}
      {showEventList && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setShowEventList(false)}>
          <div className="bg-[#0f1420] rounded-xl border border-white/10 w-full max-w-lg max-h-[70vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
              <h3 className="font-mono text-sm font-bold text-stone-100">Eventos ({filteredEvents.length}/{events.length})</h3>
              <button onClick={() => setShowEventList(false)} className="text-stone-400"><X size={16} /></button>
            </div>
            {/* Filtros */}
            <div className="px-4 py-2.5 border-b border-white/10 grid grid-cols-2 gap-2 font-mono">
              <input
                type="text" placeholder="Buscar fecha/lugar..." value={evSearch}
                onChange={e => setEvSearch(e.target.value)}
                className="col-span-2 text-[11px] px-2 py-1.5 rounded-lg bg-white/5 border border-white/10 text-stone-200"
              />
              <input
                type="number" step="0.1" placeholder="Mag. mín." value={evMinMag}
                onChange={e => setEvMinMag(e.target.value)}
                className="text-[11px] px-2 py-1.5 rounded-lg bg-white/5 border border-white/10 text-stone-200"
              />
              <input
                type="number" placeholder="Año (ej. 2024)" value={evYear}
                onChange={e => setEvYear(e.target.value)}
                className="text-[11px] px-2 py-1.5 rounded-lg bg-white/5 border border-white/10 text-stone-200"
              />
              <div className="col-span-2 flex gap-1.5">
                <span className="text-[10px] text-stone-500 self-center">Ordenar:</span>
                {(['date', 'magnitude'] as const).map(s => (
                  <button
                    key={s}
                    onClick={() => setEvSort(s)}
                    className={`text-[10px] font-bold px-2 py-1 rounded ${evSort === s ? 'bg-[#6B5B95] text-white' : 'bg-white/5 text-stone-400'}`}
                  >
                    {s === 'date' ? 'Fecha' : 'Magnitud'}
                  </button>
                ))}
              </div>
            </div>
            <div className="overflow-y-auto divide-y divide-white/5">
              {filteredEvents.map(ev => (
                <button
                  key={ev.id}
                  onClick={() => loadEvent(ev)}
                  className="w-full text-left px-4 py-2.5 hover:bg-white/5 flex items-center gap-2"
                >
                  <MapPin size={12} className={ev.sourceType === 'volcanic' ? 'text-[#C4553A]' : 'text-[#2D6A4F]'} />
                  <span className="font-mono text-[11px] text-stone-300 flex-1">{ev.label}</span>
                  <span className="font-mono text-[10px] text-stone-500">{ev.nStations} est.</span>
                </button>
              ))}
              {filteredEvents.length === 0 && (
                <div className="px-4 py-6 text-center font-mono text-[11px] text-stone-500">Ningún evento coincide.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal: generar reporte del Mapa 3D */}
      {showReport && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setShowReport(false)}>
          <div className="bg-[#0f1420] rounded-xl border border-white/10 w-full max-w-md overflow-hidden flex flex-col font-mono" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
              <h3 className="text-sm font-bold text-stone-100 flex items-center gap-2">
                <FileDown size={15} className="text-[#2D6A4F]" /> Generar reporte del Mapa 3D
              </h3>
              <button onClick={() => setShowReport(false)} className="text-stone-400"><X size={16} /></button>
            </div>

            <div className="px-4 py-3 space-y-4">
              {/* Qué incluir */}
              <div>
                <div className="text-[9px] text-stone-500 uppercase mb-2">¿Qué incluir?</div>
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
                          onChange={e => setReportOpts(o => ({ ...o, [key]: e.target.checked }))}
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
                <div className="text-[9px] text-stone-500 uppercase mb-1">Formato</div>
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

              {/* Acciones */}
              <div className="flex gap-2 pt-1">
                <button
                  onClick={handleDownloadReport}
                  className="flex-1 flex items-center justify-center gap-1.5 bg-[#C4553A] text-white text-[11px] font-bold py-2 rounded-lg"
                >
                  <FileDown size={13} /> Descargar {reportFormat.toUpperCase()}
                </button>
                {user && (
                  <button
                    onClick={handleSaveReport}
                    disabled={savingReport}
                    title="Guardar en Mis Reportes"
                    className="flex items-center justify-center gap-1.5 bg-white/5 border border-white/10 text-stone-200 text-[11px] font-bold px-3 py-2 rounded-lg disabled:opacity-50"
                  >
                    {reportMsg?.startsWith('¡Guardado') ? <Check size={13} /> : <Save size={13} />}
                    {savingReport ? 'Guardando…' : 'Guardar'}
                  </button>
                )}
              </div>
              {!user && (
                <p className="text-[9px] text-stone-500">Inicia sesión para guardar el reporte en "Mis Reportes".</p>
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
          <span className="font-mono text-[9px] w-3" style={{ color: c.color }}>{c.label}</span>
          <svg viewBox={`0 0 ${w} ${h}`} className="flex-1 h-[54px] bg-black/30 rounded" preserveAspectRatio="none">
            <line x1={0} y1={h / 2} x2={w} y2={h / 2} stroke="#334155" strokeWidth={0.5} />
            {/* Marca P y S (solo si tenemos tiempos del sintético) */}
            {tP != null && !real && <line x1={(tP / tMax) * w} y1={0} x2={(tP / tMax) * w} y2={h} stroke="#ff4d4d" strokeWidth={1} />}
            {tS != null && !real && <line x1={(tS / tMax) * w} y1={0} x2={(tS / tMax) * w} y2={h} stroke="#22d3ee" strokeWidth={1} />}
            <path d={path(c.data, c.t)} fill="none" stroke={c.color} strokeWidth={0.8} />
          </svg>
        </div>
      ))}
      {!real && tP != null && (
        <div className="flex gap-3 font-mono text-[9px]">
          <span className="text-[#ff4d4d]">P {tP.toFixed(2)} s</span>
          <span className="text-[#22d3ee]">S {tS?.toFixed(2)} s</span>
        </div>
      )}
    </div>
  );
}

/** Slider compacto con estética oscura para el panel de parámetros. */
function ParamSlider({ label, value, min, max, step, unit, onChange }: {
  label: string; value: number; min: number; max: number; step: number; unit: string; onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between text-[10px]">
        <span className="text-stone-400">{label}</span>
        <span className="text-stone-200">{value} <span className="text-stone-500">{unit}</span></span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))} className="w-full" />
    </div>
  );
}
