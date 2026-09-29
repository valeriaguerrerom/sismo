import { useState, useCallback, useEffect, useRef } from 'react';
import { downsampleWave } from '../lib/reportPdf';
import { SimulationParams, SimulationResult, SimProgress, GridInfo, WaveData } from '../lib/types';
import { defaultParams } from '../lib/simulation';
import { defaultScenario } from '../lib/scenarios';
import { epicentralDistanceKm, epicentralDistanceLabel, commonMaxAmplitude } from '../lib/format';
import { fetchSimulationFull } from '../lib/api';
import { ParametersPanel } from '../components/simulation/ParametersPanel';
import { ResultsPanel } from '../components/simulation/ResultsPanel';
import { WaveChart } from '../components/simulation/WaveChart';
import { TriaxialPlane } from '../components/simulation/TriaxialPlane';
import { ProgressBar } from '../components/simulation/ProgressBar';
import { ParticleMotion } from '../components/simulation/ParticleMotion';
import { Activity, Info, Waves, Grid3X3, Box, Play, Pause, SkipBack, RotateCcw, Flame, Save, Check, HelpCircle } from '../lib/icons';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { Tooltip } from '../components/ui/Tooltip';
import { startTour } from '../tours/useTour';
import { buildSimulacionSteps, SIMULACION_TOUR_VERSION, type ParamSectionId, type ResultSectionId } from '../tours/simulacion';

interface Props {
  initialParams?: Partial<SimulationParams> | null;
  onParamsUsed?: () => void;
  /** Datos reales enviados desde el Explorer. `nonce` cambia por cada clic. */
  realLoad?: { waveData: WaveData; label: string; params: Partial<SimulationParams>; nonce: number } | null;
  /** Se llama tras consumir realLoad, para que App lo limpie (evita relanzar). */
  onRealLoadUsed?: () => void;
}

type ViewMode = '2d' | 'triaxial' | 'particle';

export function Simulation({ initialParams, onParamsUsed, realLoad, onRealLoadUsed }: Props) {
  // Al abrir, se carga el escenario más didáctico (P y S bien separadas). Si
  // llegan parámetros iniciales (p. ej. desde el Explorador), se aplican encima.
  const [params, setParams] = useState<SimulationParams>(() => ({
    ...defaultScenario().params,
    ...(initialParams ?? {}),
  }));

  useEffect(() => {
    if (initialParams) {
      setParams(p => ({ ...p, ...initialParams }));
      onParamsUsed?.();
    }
  }, [initialParams, onParamsUsed]);

  const [result, setResult] = useState<SimulationResult | null>(null);
  // Grid submuestreado del mapa de calor (llega del backend junto al resultado).
  const [heatmapGrid, setHeatmapGrid] = useState<GridInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<SimProgress | null>(null);
  const [simError, setSimError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('2d');
  // Espejo de `result` para que launchTour (useCallback estable) siempre lea el
  // valor actual sin recrearse ni capturar un valor viejo.
  const resultRef = useRef<SimulationResult | null>(null);
  resultRef.current = result;

  // Guardado de reportes
  const { user, markTourSeen } = useAuth();

  // ── Tour guiado (Driver.js) ──
  // Secciones de acordeón que el tour fuerza a abrir en cada paso.
  const [tourParam, setTourParam] = useState<ParamSectionId | null>(null);
  const [tourResult, setTourResult] = useState<ResultSectionId | null>(null);
  const tourRef = useRef(false); // evita relanzar el auto-tour

  const launchTour = useCallback(() => {
    // Al abrir un acordeón cambia la altura del panel y la posición del elemento
    // resaltado; Driver.js reposiciona el popover al oír 'resize'. Disparamos
    // varios en los siguientes frames para cubrir el reflujo del acordeón (la
    // sección abierta pasa a ocupar el espacio restante), evitando que el
    // popover quede desalineado o "pegado" al reposicionar tarde.
    const reposition = () => {
      requestAnimationFrame(() => {
        window.dispatchEvent(new Event('resize'));
        setTimeout(() => window.dispatchEvent(new Event('resize')), 80);
        setTimeout(() => window.dispatchEvent(new Event('resize')), 200);
      });
    };
    const steps = buildSimulacionSteps({
      openParam: (s) => { setTourParam(s); reposition(); },
      openResult: (s) => { setTourResult(s); reposition(); },
      // Los pasos de resultados solo se añaden si ya hay una simulación generada.
      hasResult: resultRef.current !== null,
    });
    startTour(steps, {
      onDone: () => {
        markTourSeen('simulacion', SIMULACION_TOUR_VERSION);
        setTourParam(null);
        setTourResult(null);
      },
    });
  }, [markTourSeen]);

  // Lanza el tour automáticamente la primera vez que el usuario entra al
  // módulo, tras el primer render (rAF asegura que el DOM ya está pintado).
  useEffect(() => {
    if (tourRef.current || !user) return;
    // Versión vista del tour (valores antiguos `true` = versión 1). Si es menor
    // que la actual, el tour cambió y se muestra una vez más.
    const seen = user.tours_vistos?.simulacion;
    const seenVer = typeof seen === 'number' ? seen : (seen ? 1 : 0);
    if (seenVer >= SIMULACION_TOUR_VERSION) return;
    tourRef.current = true;
    const id = requestAnimationFrame(() => setTimeout(launchTour, 350));
    return () => cancelAnimationFrame(id);
  }, [user, launchTour]);
  const [reportTitle, setReportTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);

  // Datos reales del Galeras/CM cargados desde el Explorador (si los hay).
  const [realData, setRealData] = useState<{ waveData: WaveData; label: string } | null>(null);
  // Escala de amplitud de los sismogramas: 'common' normaliza las tres
  // componentes contra el máximo de las tres (se ve la P dominante en vertical y
  // la S en horizontales); 'component' normaliza cada traza contra su propio
  // pico. Por defecto, común.
  const [ampScale, setAmpScale] = useState<'common' | 'component'>('common');

  const handleSaveReport = useCallback(async () => {
    if (!supabase || !user || !result) return;
    setSaving(true);
    setSaveMsg(null);
    const title = reportTitle.trim() || (realData
      ? `Registro real ${realData.label}`
      : `Simulación ${result.params.sourceType === 'volcanic' ? 'volcánica' : 'tectónica'} Mw ${result.params.magnitude}`);
    // Guardamos las métricas, la malla y una versión submuestreada de las series
    // (≤ 600 puntos) para poder regenerar el reporte PDF desde "Mis Reportes".
    // Con registro real cargado, se guarda la señal REAL que ve el usuario (no
    // el pseudo-sismograma FDM), para que el PDF coincida con la pantalla.
    // Los snapshots del campo de onda no se guardan (demasiado pesados).
    const { error } = await supabase.from('simulation_reports').insert({
      user_id: user.id,
      title,
      params: result.params,
      results: {
        maxAmplitude: result.maxAmplitude,
        duration: result.duration,
        dominantFrequency: result.dominantFrequency,
        pArrival: result.pArrival,
        sArrival: result.sArrival,
        pArrivalDetected: result.pArrivalDetected,
        sArrivalDetected: result.sArrivalDetected,
        gridInfo: {
          nx: result.gridInfo.nx,
          nz: result.gridInfo.nz,
          totalSteps: result.gridInfo.totalSteps,
          dtAdjusted: result.gridInfo.dtAdjusted,
          dxAdjusted: result.gridInfo.dxAdjusted,
          epicentralDistanceKm: epicentralDistanceKm(result.gridInfo),
        },
        waveData: downsampleWave(realData ? realData.waveData : result.waveData, 600),
        isRealRecord: Boolean(realData),
        realLabel: realData?.label,
        ampScale,
      },
    });
    if (error) {
      setSaveMsg({ type: 'error', text: 'No se pudo guardar el reporte. Inténtalo de nuevo.' });
      console.error('Error guardando reporte:', error.message);
    } else {
      setSaveMsg({ type: 'ok', text: '¡Reporte guardado! Míralo en "Mis Reportes".' });
      setReportTitle('');
    }
    setSaving(false);
  }, [user, result, reportTitle, realData, ampScale]);

  // Ref a la última versión de runSimulation para poder llamarla desde el
  // efecto de datos reales sin meterla en sus dependencias (evita re-lanzar).
  const runSimulationRef = useRef<(p?: SimulationParams, to3D?: boolean) => void>(() => {});

  // Cargar datos reales enviados desde el Explorer.
  // Muestra el registro real (vista 2D) y lanza el FDM en segundo plano para
  // la propagación 3D. IMPORTANTE: la simulación usa los parámetros que llegan
  // con el evento (initialParams), no un closure viejo de `params`.
  useEffect(() => {
    if (!realLoad) return;
    // Fija el sismograma real de la estación elegida y sus parámetros. Todo
    // viaja junto en realLoad, así siempre es consistente (no depende de que
    // otro efecto haya aplicado initialParams antes).
    setRealData({ waveData: realLoad.waveData, label: realLoad.label });
    setParams({ ...defaultParams(), ...realLoad.params });
    setViewMode('2d');

    const runParams: SimulationParams = { ...defaultParams(), ...realLoad.params };

    // El FDM corre en segundo plano (background=true) para preparar el mapa de
    // calor SIN ocultar el sismograma real ni cambiar de pestaña. La vista se
    // queda en el registro real (2D).
    const timer = setTimeout(() => {
      runSimulationRef.current(runParams, true);
      // Ya consumido: App limpia realLoad para que al volver a entrar al
      // simulador NO se relance esta simulación (era el "predeterminado").
      onRealLoadUsed?.();
    }, 100);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [realLoad?.nonce]);

  // 2D waveform playback
  const [wave2dPlaying, setWave2dPlaying] = useState(false);
  const [wave2dRatio, setWave2dRatio] = useState(1);
  const [wave2dSpeed, setWave2dSpeed] = useState(1);
  const wave2dRef = useRef<number>(0);

  // Ejecuta el FDM. Acepta params explícitos (para el auto-run de datos reales,
  // que debe usar los del evento y no el estado `params` que puede ir desfasado).
  // `background=true` (auto-run de datos reales): el FDM corre en silencio para
  // preparar el mapa de calor, SIN mostrar barra de progreso ni ocultar el
  // sismograma real, y sin cambiar de pestaña. La vista se queda en el registro
  // real (2D) hasta que el usuario abra "Mapa de calor".
  const runSimulation = useCallback((overrideParams?: SimulationParams, background = false) => {
    const runParams = overrideParams ?? params;
    if (!background) {
      setLoading(true);
      setResult(null);
      setSimError(null);
      setProgress({ step: 0, totalSteps: 100, percent: 0 });
    }

    // El cómputo ocurre en el backend (FastAPI). Como la respuesta es una sola
    // petición sin streaming de progreso, animamos una barra "optimista" que
    // avanza suavemente hacia ~90% mientras esperamos y salta a 100% al llegar.
    let fakePct = 0;
    let progTimer: ReturnType<typeof setInterval> | null = null;
    if (!background) {
      progTimer = setInterval(() => {
        fakePct = Math.min(90, fakePct + Math.max(1, (90 - fakePct) * 0.08));
        setProgress({ step: Math.round(fakePct), totalSteps: 100, percent: Math.round(fakePct) });
      }, 200);
    }
    const stopProg = () => { if (progTimer) { clearInterval(progTimer); progTimer = null; } };

    fetchSimulationFull(runParams)
      .then(({ result: r, heatmapGrid: hg }) => {
        setResult(r);
        setHeatmapGrid(hg);
        stopProg();
        if (!background) {
          setProgress({ step: 100, totalSteps: 100, percent: 100 });
          setLoading(false);
          setProgress(null);
          setWave2dRatio(0);
          setWave2dPlaying(true);
        }
      })
      .catch((err) => {
        stopProg();
        console.error('Error en la simulación:', err);
        // En cualquier fallo (conexión, reinicio del servidor, tiempo de espera
        // agotado o error del backend) mostramos un mensaje claro y devolvemos
        // el control: setLoading(false) rehabilita el botón "Generar" y quita la
        // pantalla de carga, nunca se queda congelada.
        if (!background) {
          setLoading(false);
          setProgress(null);
          setSimError('No pudimos completar la simulación. Revisa tu conexión e inténtalo de nuevo.');
        }
      });
  }, [params]);

  // Mantener la ref del auto-run apuntando a la última versión.
  useEffect(() => {
    runSimulationRef.current = runSimulation;
  }, [runSimulation]);

  // Botón manual "Generar": siempre con barra de progreso (background=false).
  const handleRun = useCallback(() => {
    runSimulation(undefined, false);
  }, [runSimulation]);

  // Limpiar el mensaje de guardado cuando cambia el resultado
  useEffect(() => {
    setSaveMsg(null);
    setReportTitle('');
  }, [result]);

  // 2D waveform playback animation. Solo corre en la pestaña de sismogramas;
  // en el corte del subsuelo el reproductor del propio componente avanza el
  // mismo tiempo compartido (wave2dRatio), evitando un doble avance.
  useEffect(() => {
    // El corte del subsuelo (triaxial) tiene su propio reproductor interno que
    // avanza el tiempo compartido; aquí solo animamos los sismogramas (2d) y el
    // movimiento de partícula (particle), que no tienen loop propio.
    if (viewMode === 'triaxial') return;
    if (!wave2dPlaying || (!result && !realData)) return;
    // Playback takes ~15s at 1x speed regardless of simulation duration
    const baseSpeed = (1 / (15 * 60)) * wave2dSpeed; // 15 seconds * 60fps
    const tick = () => {
      setWave2dRatio(prev => {
        const next = prev + baseSpeed;
        if (next >= 1) {
          setWave2dPlaying(false);
          return 1;
        }
        return next;
      });
      wave2dRef.current = requestAnimationFrame(tick);
    };
    wave2dRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(wave2dRef.current);
  }, [wave2dPlaying, result, realData, wave2dSpeed, viewMode]);

  return (
    <div className="min-h-screen bg-[#FAFAF8] pt-16">
      <div className="bg-white border-b border-stone-200/60 px-6 py-2.5">
        <div className="max-w-[1440px] mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-[#1A1A2E] font-bold text-lg flex items-center gap-2">
              <Activity size={18} className="text-[#C4553A]" />
              Módulo de Simulación Triaxial
              {/* Botón de ayuda: repite el tour guiado cuando el usuario quiera. */}
              <Tooltip content="Ver guía">
                <button
                  type="button"
                  onClick={launchTour}
                  aria-label="Ver guía"
                  className={`flex items-center justify-center w-6 h-6 rounded-full border border-stone-200 text-stone-400 hover:text-[#C4553A] hover:border-[#C4553A]/40 transition-colors ${user && ((typeof user.tours_vistos?.simulacion === 'number' ? user.tours_vistos.simulacion : (user.tours_vistos?.simulacion ? 1 : 0)) < SIMULACION_TOUR_VERSION) ? 'help-pulse' : ''}`}
                >
                  <HelpCircle size={14} />
                </button>
              </Tooltip>
            </h1>
            <p className="hidden sm:block text-stone-400 text-[11px] mt-0.5">Diferencias finitas en 2D sobre la ecuación de onda elástica</p>
          </div>
          <div className="hidden lg:flex items-center gap-2 bg-stone-50 border border-stone-200/60 rounded-lg px-3 py-1.5 text-xs text-stone-400">
            <Info size={12} />
            Pasa el cursor o toca el ícono de información para ver qué significa cada término
          </div>
        </div>
      </div>

      <div className="max-w-[1440px] mx-auto px-4 pt-4 pb-6">
        <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr_300px] gap-4 items-start">
          {/* Columna de parámetros: sticky en desktop, sin recortar contenido.
              Con acordeón exclusivo el contenido es corto; si una sección larga
              excede la altura, hay scroll interno suave (nunca corte). */}
          <div className="lg:h-[calc(100dvh-154px)] lg:sticky lg:top-16">
            <ParametersPanel params={params} onChange={setParams} onRun={handleRun} loading={loading} forceSection={tourParam} firstBounceS={result?.gridInfo.firstBounceS ?? null} />
          </div>

          <div className="flex flex-col gap-4 lg:max-h-[calc(100dvh-154px)] lg:overflow-y-auto scrollbar-thin lg:pr-1">
            <div data-viz-area data-tour="viz-area" className="bg-white rounded-xl border border-stone-200/60 shadow-sm p-4">
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 mb-4">
                <div>
                  <h2 className="font-bold text-[#1A1A2E]">Visualización</h2>
                  <p className="text-xs text-stone-400 mt-0.5">
                    {viewMode === '2d' && 'Sismogramas triaxiales · Componentes N · E · Z'}
                    {viewMode === 'triaxial' && 'Propagación del campo de ondas en un corte vertical'}
                    {viewMode === 'particle' && 'Trayectoria del suelo en la estación: norte, este y vertical'}
                  </p>
                </div>
                {/* View toggle: nombres cortos para que las tres pestañas quepan
                    en una fila en escritorio; cada una tiene un tooltip con el
                    nombre completo. En pantallas estrechas envuelve sin scroll
                    horizontal. */}
                <div className="flex flex-wrap bg-stone-100 rounded-lg p-0.5 gap-0.5">
                  <button
                    onClick={() => setViewMode('2d')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                      viewMode === '2d' ? 'bg-white text-[#C4553A] shadow-sm' : 'text-stone-400'
                    }`}
                  >
                    <Waves size={13} /> <Tooltip content="Sismogramas triaxiales (Norte, Este, Vertical)">Sismogramas</Tooltip>
                  </button>
                  <button
                    onClick={() => setViewMode('triaxial')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                      viewMode === 'triaxial' ? 'bg-white text-[#C4553A] shadow-sm' : 'text-stone-400'
                    }`}
                  >
                    <Grid3X3 size={13} /> <Tooltip content="Mapa de calor del subsuelo (corte vertical)">Mapa de calor</Tooltip>
                  </button>
                  <button
                    onClick={() => setViewMode('particle')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                      viewMode === 'particle' ? 'bg-white text-[#C4553A] shadow-sm' : 'text-stone-400'
                    }`}
                  >
                    <Box size={13} /> <Tooltip content="Movimiento de partícula (trayectoria 3D del suelo)">Partícula</Tooltip>
                  </button>
                </div>
              </div>

              {/* Progress bar */}
              {loading && progress && <ProgressBar progress={progress} />}

              {/* Error del backend (no se pudo simular). */}
              {!loading && simError && (
                <div className="flex items-start gap-2 bg-[#C4553A]/5 border border-[#C4553A]/20 rounded-xl p-3 text-sm text-[#C4553A]">
                  <Info size={16} className="mt-0.5 shrink-0" />
                  <span>{simError}</span>
                </div>
              )}

              {/* Empty state (compacto: no reserva altura enorme) */}
              {!loading && !result && !realData && !simError && (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <div className="w-14 h-14 rounded-2xl bg-stone-100 flex items-center justify-center mb-3">
                    <Activity size={26} className="text-stone-300" />
                  </div>
                  <h3 className="font-semibold text-stone-500 mb-1">Aún no has generado un sismograma</h3>
                  <p className="text-stone-400 text-sm max-w-xs leading-relaxed">
                    Ajusta los parámetros de la izquierda y pulsa "Generar pseudo-sismograma". Tienes la guía paso a paso en la columna de la derecha.
                  </p>
                </div>
              )}

              {/* Real data from Galeras .mseed — only in 2D mode */}
              {!loading && realData && viewMode === '2d' && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 bg-[#C4553A]/5 rounded-xl p-3 border border-[#C4553A]/20">
                    <Flame size={16} className="text-[#C4553A]" />
                    <div className="flex-1">
                      <span className="text-xs font-bold text-[#1A1A2E]">Datos Reales — {realData.label}</span>
                      <p className="text-[10px] text-stone-400">
                        {realData.label.startsWith('CM')
                          ? 'Sismograma triaxial real de la Red Sismológica Nacional (SGC).'
                          : 'Sismograma triaxial real del Volcán Galeras (OVSP).'}
                        {' '}El mapa de calor del subsuelo con la propagación (parámetros equivalentes) se genera automáticamente; véalo en la pestaña "Mapa de calor del subsuelo".
                      </p>
                    </div>
                    <button onClick={() => setRealData(null)} className="text-[10px] text-stone-400 px-2 py-1 rounded bg-white border border-stone-200">
                      Cerrar
                    </button>
                  </div>

                  {/* Playback controls for real data */}
                  <div className="flex flex-wrap items-center gap-2 sm:gap-3 bg-stone-50 rounded-xl p-2.5 border border-stone-100">
                    <button onClick={() => { setWave2dRatio(0); setWave2dPlaying(false); }} className="p-1.5 rounded-lg bg-white border border-stone-200 text-stone-500 shadow-sm">
                      <SkipBack size={13} />
                    </button>
                    <button onClick={() => {
                      if (wave2dRatio >= 1) { setWave2dRatio(0); }
                      setWave2dPlaying(!wave2dPlaying);
                    }} className="p-2 rounded-lg bg-[#C4553A] text-white shadow-md shadow-[#C4553A]/20">
                      {wave2dPlaying ? <Pause size={14} /> : <Play size={14} />}
                    </button>
                    <button onClick={() => { setWave2dRatio(0); setWave2dPlaying(true); }} className="p-1.5 rounded-lg bg-white border border-stone-200 text-stone-500 shadow-sm">
                      <RotateCcw size={13} />
                    </button>
                    <input
                      type="range" min={0} max={100} value={Math.round(wave2dRatio * 100)}
                      onChange={e => { setWave2dRatio(Number(e.target.value) / 100); setWave2dPlaying(false); }}
                      className="flex-1 min-w-[140px]"
                    />
                    <span className="text-xs font-mono text-stone-400 w-20 text-right">
                      {(wave2dRatio * (realData.waveData.time[realData.waveData.time.length - 1] ?? 0)).toFixed(1)}s / {(realData.waveData.time[realData.waveData.time.length - 1] ?? 0).toFixed(0)}s
                    </span>
                    <div className="flex gap-1">
                      {[0.5, 1, 2].map(s => (
                        <button key={s} onClick={() => setWave2dSpeed(s)}
                          className={`text-[10px] px-2.5 py-1.5 rounded-lg font-bold ${wave2dSpeed === s ? 'bg-[#C4553A] text-white' : 'bg-white border border-stone-200 text-stone-400'}`}>{s}x</button>
                      ))}
                    </div>
                  </div>

                  <div className="bg-stone-50 rounded-lg p-3 border border-stone-100">
                    <div className="flex gap-4 text-xs text-stone-500 mb-3">
                      <span className="flex items-center gap-1"><span className="w-2 h-0.5 bg-[#C4553A] inline-block" /> Norte</span>
                      <span className="flex items-center gap-1"><span className="w-2 h-0.5 bg-[#2D6A4F] inline-block" /> Este</span>
                      <span className="flex items-center gap-1"><span className="w-2 h-0.5 bg-[#D4A853] inline-block" /> Vertical</span>
                    </div>
                    <WaveChart data={realData.waveData} label="Norte (N)" component="north" color="#C4553A" height={110} visibleRatio={wave2dRatio} robustScale />
                  </div>
                  <div className="bg-stone-50 rounded-lg p-3 border border-stone-100">
                    <WaveChart data={realData.waveData} label="Este (E)" component="east" color="#2D6A4F" height={110} visibleRatio={wave2dRatio} robustScale />
                  </div>
                  <div className="bg-stone-50 rounded-lg p-3 border border-stone-100">
                    <WaveChart data={realData.waveData} label="Vertical (Z)" component="vertical" color="#D4A853" height={110} visibleRatio={wave2dRatio} robustScale />
                  </div>
                </div>
              )}

              {/* 2D Wave view — solo simulación pura (sin datos reales cargados).
                  Con datos reales, la vista 2D muestra el registro real y el
                  sintético FDM se ve únicamente en "Propagación 3D". */}
              {!loading && result && !realData && viewMode === '2d' && (
                <div className="space-y-3">
                  {/* Playback controls */}
                  <div className="flex flex-wrap items-center gap-2 sm:gap-3 bg-stone-50 rounded-xl p-2.5 border border-stone-100">
                    <button onClick={() => { setWave2dRatio(0); setWave2dPlaying(false); }} className="p-1.5 rounded-lg bg-white border border-stone-200 text-stone-500 shadow-sm">
                      <SkipBack size={13} />
                    </button>
                    <button onClick={() => {
                      if (wave2dRatio >= 1) { setWave2dRatio(0); }
                      setWave2dPlaying(!wave2dPlaying);
                    }} className="p-2 rounded-lg bg-[#C4553A] text-white shadow-md shadow-[#C4553A]/20">
                      {wave2dPlaying ? <Pause size={14} /> : <Play size={14} />}
                    </button>
                    <button onClick={() => { setWave2dRatio(0); setWave2dPlaying(true); }} className="p-1.5 rounded-lg bg-white border border-stone-200 text-stone-500 shadow-sm">
                      <RotateCcw size={13} />
                    </button>
                    <input
                      type="range" min={0} max={100} value={Math.round(wave2dRatio * 100)}
                      onChange={e => { setWave2dRatio(Number(e.target.value) / 100); setWave2dPlaying(false); }}
                      className="flex-1 min-w-[140px]"
                    />
                    <span className="text-xs font-mono text-stone-400 w-20 text-right">
                      {(wave2dRatio * (result.waveData.time[result.waveData.time.length - 1] ?? 0)).toFixed(1)}s / {(result.waveData.time[result.waveData.time.length - 1] ?? 0).toFixed(0)}s
                    </span>
                    <div className="flex gap-1">
                      {[0.5, 1, 2].map(s => (
                        <button key={s} onClick={() => setWave2dSpeed(s)}
                          className={`text-[10px] px-2.5 py-1.5 rounded-lg font-bold ${wave2dSpeed === s ? 'bg-[#C4553A] text-white' : 'bg-white border border-stone-200 text-stone-400'}`}>{s}x</button>
                      ))}
                    </div>
                  </div>

                  {/* Selector de escala de amplitud */}
                  <div className="flex items-center justify-between gap-2 bg-stone-50 rounded-xl px-3 py-2 border border-stone-100">
                    <span className="text-[11px] text-stone-500">
                      <Tooltip content="Común: las tres trazas se miden con la misma regla (el máximo de las tres), así ves cuál se mueve más. Por componente: cada traza se estira a su propio máximo (ves su forma aunque sea pequeña)." showIcon>Escala de amplitud</Tooltip>
                    </span>
                    <div className="flex gap-1">
                      {([['common', 'Común'], ['component', 'Por componente']] as const).map(([mode, txt]) => (
                        <button key={mode} onClick={() => setAmpScale(mode)}
                          className={`text-[10px] px-2.5 py-1.5 rounded-lg font-bold ${ampScale === mode ? 'bg-[#C4553A] text-white' : 'bg-white border border-stone-200 text-stone-400'}`}>{txt}</button>
                      ))}
                    </div>
                  </div>

                  <div className="bg-stone-50 rounded-lg p-3 border border-stone-100">
                    <div className="flex gap-4 text-xs text-stone-500 mb-1">
                      <span className="flex items-center gap-1"><span className="w-2 h-0.5 bg-[#C4553A] inline-block" /> Norte</span>
                      <span className="flex items-center gap-1"><span className="w-2 h-0.5 bg-[#2D6A4F] inline-block" /> Este</span>
                      <span className="flex items-center gap-1"><span className="w-2 h-0.5 bg-[#D4A853] inline-block" /> Vertical</span>
                    </div>
                    <p className="text-[10px] text-stone-400 mb-3">
                      Estación virtual a {epicentralDistanceLabel(result.gridInfo)} del epicentro, en superficie.
                      {' '}
                      {ampScale === 'common'
                        ? 'Escala común: las tres trazas se normalizan contra el máximo de las tres.'
                        : 'Escala por componente: cada traza se normaliza contra su propio máximo.'}
                    </p>
                    <WaveChart data={result.waveData} label="Norte (N)" component="north" color="#C4553A" height={110} visibleRatio={wave2dRatio} pArrival={result.pArrival} sArrival={result.sArrival} refAmpOverride={ampScale === 'common' ? commonMaxAmplitude(result.waveData) : undefined} />
                  </div>
                  <div className="bg-stone-50 rounded-lg p-3 border border-stone-100">
                    <WaveChart data={result.waveData} label="Este (E)" component="east" color="#2D6A4F" height={110} visibleRatio={wave2dRatio} pArrival={result.pArrival} sArrival={result.sArrival} refAmpOverride={ampScale === 'common' ? commonMaxAmplitude(result.waveData) : undefined} />
                  </div>
                  <div className="bg-stone-50 rounded-lg p-3 border border-stone-100">
                    <WaveChart data={result.waveData} label="Vertical (Z)" component="vertical" color="#D4A853" height={110} visibleRatio={wave2dRatio} pArrival={result.pArrival} sArrival={result.sArrival} refAmpOverride={ampScale === 'common' ? commonMaxAmplitude(result.waveData) : undefined} />
                  </div>
                </div>
              )}

              {/* Corte del subsuelo */}
              {!loading && result && viewMode === 'triaxial' && (
                <TriaxialPlane
                  snapshots={result.snapshots}
                  gridInfo={heatmapGrid ?? result.gridInfo}
                  fullGrid={result.gridInfo}
                  vp={result.params.vp}
                  vs={result.params.vs}
                  pArrival={result.pArrival}
                  sArrival={result.sArrival}
                  currentTime={wave2dRatio * result.duration}
                  onTimeChange={(t) => setWave2dRatio(result.duration > 0 ? Math.max(0, Math.min(1, t / result.duration)) : 0)}
                  playing={wave2dPlaying}
                  onPlayingChange={setWave2dPlaying}
                />
              )}

              {/* Movimiento de partícula (hodograma 3D). Usa las tres componentes
                  reales que ve el usuario: el registro real si está cargado, o
                  el pseudo-sismograma FDM en una simulación pura. Los arribos P/S
                  vienen de la simulación (result). */}
              {!loading && (result || realData) && viewMode === 'particle' && (() => {
                const pmWave = realData ? realData.waveData : result!.waveData;
                const pmLastT = pmWave.time[pmWave.time.length - 1] ?? 0;
                return (
                  <div className="space-y-3">
                    {/* Reproductor compartido (mismo tiempo que sismogramas y corte). */}
                    <div className="flex flex-wrap items-center gap-2 sm:gap-3 bg-stone-50 rounded-xl p-2.5 border border-stone-100">
                      <button onClick={() => { setWave2dRatio(0); setWave2dPlaying(false); }} className="p-1.5 rounded-lg bg-white border border-stone-200 text-stone-500 shadow-sm">
                        <SkipBack size={13} />
                      </button>
                      <button onClick={() => { if (wave2dRatio >= 1) { setWave2dRatio(0); } setWave2dPlaying(!wave2dPlaying); }} className="p-2 rounded-lg bg-[#C4553A] text-white shadow-md shadow-[#C4553A]/20">
                        {wave2dPlaying ? <Pause size={14} /> : <Play size={14} />}
                      </button>
                      <button onClick={() => { setWave2dRatio(0); setWave2dPlaying(true); }} className="p-1.5 rounded-lg bg-white border border-stone-200 text-stone-500 shadow-sm">
                        <RotateCcw size={13} />
                      </button>
                      <input
                        type="range" min={0} max={100} value={Math.round(wave2dRatio * 100)}
                        onChange={e => { setWave2dRatio(Number(e.target.value) / 100); setWave2dPlaying(false); }}
                        className="flex-1 min-w-[140px]"
                      />
                      <span className="text-xs font-mono text-stone-400 w-20 text-right">
                        {(wave2dRatio * pmLastT).toFixed(1)}s / {pmLastT.toFixed(0)}s
                      </span>
                      <div className="flex gap-1">
                        {[0.5, 1, 2].map(sp => (
                          <button key={sp} onClick={() => setWave2dSpeed(sp)}
                            className={`text-[10px] px-2.5 py-1.5 rounded-lg font-bold ${wave2dSpeed === sp ? 'bg-[#C4553A] text-white' : 'bg-white border border-stone-200 text-stone-400'}`}>{sp}x</button>
                        ))}
                      </div>
                    </div>
                    <ParticleMotion
                      waveData={pmWave}
                      pArrival={result?.pArrival ?? 0}
                      sArrival={result?.sArrival ?? 0}
                      currentTime={wave2dRatio * pmLastT}
                    />
                  </div>
                );
              })()}

            </div>

            {/* Guardar reporte */}
            {result && (
              <div className="bg-white rounded-xl border border-stone-200/60 shadow-sm p-4">
                {user ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Save size={16} className="text-[#2D6A4F]" />
                      <h3 className="font-bold text-[#1A1A2E] text-sm">Guardar como reporte</h3>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input
                        type="text"
                        value={reportTitle}
                        onChange={e => setReportTitle(e.target.value)}
                        placeholder={`Simulación ${result.params.sourceType === 'volcanic' ? 'volcánica' : 'tectónica'} Mw ${result.params.magnitude}`}
                        className="flex-1 px-3 py-2 rounded-xl border border-stone-200 text-sm focus:outline-none focus:border-[#C4553A] bg-stone-50"
                      />
                      <button
                        onClick={handleSaveReport}
                        disabled={saving}
                        className="flex items-center justify-center gap-2 bg-[#2D6A4F] text-white px-4 py-2 rounded-xl font-bold text-sm shadow-lg shadow-[#2D6A4F]/20 disabled:opacity-50 btn-hover"
                      >
                        {saving ? 'Guardando...' : <><Save size={14} /> Guardar</>}
                      </button>
                    </div>
                    {saveMsg && (
                      <p className={`text-xs rounded-lg p-2 border flex items-center gap-1.5 ${
                        saveMsg.type === 'ok'
                          ? 'text-green-600 bg-green-50 border-green-100'
                          : 'text-red-500 bg-red-50 border-red-100'
                      }`}>
                        {saveMsg.type === 'ok' && <Check size={13} />}
                        {saveMsg.text}
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-xs text-stone-400">
                    <Info size={14} />
                    Inicia sesión para guardar esta simulación como reporte y exportarla luego.
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Columna de resultados: sticky con altura acotada. El scroll vive
              DENTRO de ResultsPanel (zona de acordeones), para que los botones
              de exportación queden fijos abajo, siempre visibles. */}
          <div data-tour="results-panel" className="lg:h-[calc(100dvh-154px)] lg:sticky lg:top-16">
            <ResultsPanel result={result} realRecord={realData} forceSection={tourResult} ampScale={ampScale} heatmapGrid={heatmapGrid} />
          </div>
        </div>
      </div>
    </div>
  );
}
