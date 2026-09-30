import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { SimulationParams, SimulationResult, SimProgress, GridInfo, WaveData } from '../lib/types';
import { defaultParams } from '../lib/simulation';
import { defaultScenario } from '../lib/scenarios';
import { commonMaxAmplitude } from '../lib/format';
import { computeEventWindow } from '../lib/waveWindow';
import { fetchSimulationFull } from '../lib/api';
import { ParametersPanel } from '../components/simulation/ParametersPanel';
import { ResultsPanel } from '../components/simulation/ResultsPanel';
import { WaveChart } from '../components/simulation/WaveChart';
import { TriaxialPlane } from '../components/simulation/TriaxialPlane';
import { ProgressBar } from '../components/simulation/ProgressBar';
import { ParticleMotion } from '../components/simulation/ParticleMotion';
import { Activity, Info, Waves, Grid3X3, Box, Play, Pause, SkipBack, RotateCcw, Flame, HelpCircle, Maximize, Minimize } from '../lib/icons';
import { useAuth } from '../lib/auth';
import { Tooltip } from '../components/ui/Tooltip';
import { startTour, refreshActiveTour } from '../tours/useTour';
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
  // Modo ampliado: la Visualización pasa a un panel casi a pantalla completa
  // (sin scroll de la página) y al reducir vuelve a su tamaño normal en la
  // columna. Es la forma de ver la simulación en grande sin scroll molesto.
  const [vizExpanded, setVizExpanded] = useState(false);
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
  // Cuando el tour introductorio (solo parámetros) termina SIN que haya aún una
  // simulación, queda "pendiente": al generar la primera, se continúa con los
  // pasos de resultados automáticamente.
  const resultTourPendingRef = useRef(false);

  const launchTour = useCallback((opts?: { resultsOnly?: boolean }) => {
    const resultsOnly = opts?.resultsOnly ?? false;
    // Al abrir un acordeón o cambiar de pestaña cambia el layout y la posición
    // del elemento resaltado. Pedimos a Driver.js que RECALCULE la posición del
    // popover (refresh) tras el reflujo de React, en varios frames.
    const reposition = () => {
      requestAnimationFrame(() => requestAnimationFrame(() => {
        refreshActiveTour();
        setTimeout(refreshActiveTour, 120);
        setTimeout(refreshActiveTour, 260);
      }));
    };
    const hasResult = resultRef.current !== null;
    const steps = buildSimulacionSteps({
      openParam: (s) => { setTourParam(s); reposition(); },
      openResult: (s) => { setTourResult(s); reposition(); },
      showView: (v) => { setViewMode(v); reposition(); },
      hasResult,
      resultsOnly,
    });
    startTour(steps, {
      onDone: () => {
        setTourParam(null);
        setTourResult(null);
        // Si el tour de parámetros terminó pero aún no hay simulación, dejamos
        // pendiente la parte de resultados para cuando el usuario genere. Solo
        // se marca como visto del todo cuando ya se mostraron los resultados.
        if (!resultsOnly && !hasResult) {
          resultTourPendingRef.current = true;
        } else {
          resultTourPendingRef.current = false;
          markTourSeen('simulacion', SIMULACION_TOUR_VERSION);
        }
      },
    });
  }, [markTourSeen]);

  // Continúa el tour con los pasos de resultados cuando llega la PRIMERA
  // simulación y el tour de parámetros había quedado pendiente.
  useEffect(() => {
    if (result && resultTourPendingRef.current) {
      resultTourPendingRef.current = false;
      // Da un instante a que los paneles de resultados se pinten.
      const id = setTimeout(() => launchTour({ resultsOnly: true }), 400);
      return () => clearTimeout(id);
    }
  }, [result, launchTour]);

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
    const id = requestAnimationFrame(() => setTimeout(() => launchTour(), 350));
    return () => cancelAnimationFrame(id);
  }, [user, launchTour]);
  // Datos reales del Galeras/CM cargados desde el Explorador (si los hay).
  const [realData, setRealData] = useState<{ waveData: WaveData; label: string } | null>(null);
  // Parámetros del evento real (tipo de fuente, magnitud, epicentro…) para el
  // reporte del registro real. No se editan (los reales no se cambian).
  const [realParams, setRealParams] = useState<SimulationParams | null>(null);
  // Escala de amplitud de los sismogramas: 'common' normaliza las tres
  // componentes contra el máximo de las tres (se ve la P dominante en vertical y
  // la S en horizontales); 'component' normaliza cada traza contra su propio
  // pico. Por defecto, común.
  const [ampScale, setAmpScale] = useState<'common' | 'component'>('common');

  // En modo ampliado: bloquea el scroll del fondo y cierra con Escape.
  useEffect(() => {
    if (!vizExpanded) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setVizExpanded(false); };
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', onKey); };
  }, [vizExpanded]);

  // Al ampliar/reducir cambia el tamaño del contenedor de los lienzos 3D
  // (mapa de calor y partícula); forzamos que se re-midan tras el reflujo.
  useEffect(() => {
    const id = setTimeout(() => window.dispatchEvent(new Event('resize')), 60);
    return () => clearTimeout(id);
  }, [vizExpanded]);

  // ── Reproducción 2D (declarada antes del efecto de carga real, que la usa
  //    para arrancar la animación automáticamente) ──
  const [wave2dPlaying, setWave2dPlaying] = useState(false);
  const [wave2dRatio, setWave2dRatio] = useState(1);
  // Velocidad de reproducción por defecto 2x (B2); opciones 0.5–4x.
  const [wave2dSpeed, setWave2dSpeed] = useState(2);
  // Encuadre de los sismogramas (B1): "Ajustar al evento" por defecto (recorta
  // al pulso) con opción de ver toda la duración.
  const [fitToEvent, setFitToEvent] = useState(true);
  const wave2dRef = useRef<number>(0);

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
    setRealParams({ ...defaultParams(), ...realLoad.params });
    setParams({ ...defaultParams(), ...realLoad.params });
    // Un registro real NO tiene mapa de calor ni movimiento de partícula (esos
    // viven en el laboratorio de simulación): la única vista es el sismograma.
    setViewMode('2d');
    // El registro real se analiza tal cual: NO se corre ninguna simulación FDM
    // de apoyo. Las métricas y la interpretación se calculan sobre la señal.
    setResult(null);
    // Arranca la REPRODUCCIÓN del sismograma real automáticamente al cargarlo
    // (desde el inicio): así el registro "empieza a correr" solo, sin pulsar play.
    setWave2dRatio(0);
    setWave2dPlaying(true);

    // Ya consumido: App limpia realLoad para que al volver a entrar al
    // simulador NO se relance nada.
    onRealLoadUsed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [realLoad?.nonce]);



  // Ejecuta el FDM en el laboratorio de simulación. El cómputo ocurre en el
  // backend (FastAPI). Como la respuesta es una sola petición sin streaming de
  // progreso, animamos una barra "optimista" que avanza hacia ~90% mientras
  // esperamos y salta a 100% al llegar.
  const runSimulation = useCallback(() => {
    const runParams = params;
    setLoading(true);
    setResult(null);
    setSimError(null);
    setProgress({ step: 0, totalSteps: 100, percent: 0 });

    let fakePct = 0;
    let progTimer: ReturnType<typeof setInterval> | null = setInterval(() => {
      fakePct = Math.min(90, fakePct + Math.max(1, (90 - fakePct) * 0.08));
      setProgress({ step: Math.round(fakePct), totalSteps: 100, percent: Math.round(fakePct) });
    }, 200);
    const stopProg = () => { if (progTimer) { clearInterval(progTimer); progTimer = null; } };

    fetchSimulationFull(runParams)
      .then(({ result: r, heatmapGrid: hg }) => {
        setResult(r);
        setHeatmapGrid(hg);
        stopProg();
        setProgress({ step: 100, totalSteps: 100, percent: 100 });
        setLoading(false);
        setProgress(null);
        setWave2dRatio(0);
        setWave2dPlaying(true);
      })
      .catch((err) => {
        stopProg();
        console.error('Error en la simulación:', err);
        // En cualquier fallo (conexión, reinicio del servidor, tiempo de espera
        // agotado o error del backend) mostramos un mensaje claro y devolvemos
        // el control: setLoading(false) rehabilita el botón "Generar" y quita la
        // pantalla de carga, nunca se queda congelada.
        setLoading(false);
        setProgress(null);
        setSimError('No pudimos completar la simulación. Revisa tu conexión e inténtalo de nuevo.');
      });
  }, [params]);

  // Botón manual "Generar": siempre con barra de progreso.
  const handleRun = useCallback(() => {
    runSimulation();
  }, [runSimulation]);

  // ── Bloqueo de parámetros con un registro real cargado ──
  // Los registros reales no se modifican: sus parámetros son fijos. Si el
  // usuario intenta cambiar un parámetro (o generar) estando en un registro
  // real, se le pregunta si quiere SALIR del registro real para pasar al
  // laboratorio de simulación (donde sí puede ajustar el modelo). Guardamos la
  // edición pendiente para aplicarla si confirma.
  const [exitRealPrompt, setExitRealPrompt] = useState(false);
  const pendingParamsRef = useRef<SimulationParams | null>(null);

  const handleParamsChange = useCallback((next: SimulationParams) => {
    if (realData) {
      // En modo registro real: no se aplica el cambio; se ofrece salir al lab.
      pendingParamsRef.current = next;
      setExitRealPrompt(true);
      return;
    }
    setParams(next);
  }, [realData]);

  const handleRunGuarded = useCallback(() => {
    if (realData) { setExitRealPrompt(true); return; }
    handleRun();
  }, [realData, handleRun]);

  // Confirma salir del registro real: descarta el registro y pasa al laboratorio
  // con los parámetros del evento como punto de partida (editables).
  const confirmExitReal = useCallback(() => {
    setRealData(null);
    setRealParams(null);
    setResult(null);
    setWave2dPlaying(false);
    setViewMode('2d');
    if (pendingParamsRef.current) {
      setParams(pendingParamsRef.current);
      pendingParamsRef.current = null;
    }
    setExitRealPrompt(false);
  }, []);



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

  // Ventana "del evento" (B1) para recortar los sismogramas al pulso. Se calcula
  // una para el resultado simulado y otra para el registro real. Cuando el
  // usuario desactiva "Ajustar al evento", se pasa undefined (duración completa).
  const simWindow = useMemo(
    () => (result ? computeEventWindow(result.waveData, { pArrival: result.pArrival, sArrival: result.sArrival }) : null),
    [result],
  );
  const realWindow = useMemo(
    () => (realData ? computeEventWindow(realData.waveData) : null),
    [realData],
  );
  const simWin = fitToEvent ? simWindow : null;
  const realWin = fitToEvent ? realWindow : null;

  // Primer rebote de borde = el MENOR entre el de la P y el de la S (con roca
  // rápida, p. ej. el semiespacio de dos capas, la P rebota antes). Es el
  // tiempo tras el cual pueden aparecer reflexiones artificiales de los bordes.
  const firstBounce = useMemo(() => {
    const g = result?.gridInfo;
    if (!g) return null;
    const bs = [g.firstBounceP, g.firstBounceS].filter(
      (b): b is number => typeof b === 'number' && b > 0,
    );
    return bs.length ? Math.min(...bs) : null;
  }, [result]);
  // Tiempo a marcar en las trazas (solo si la ventana lo supera).
  const reflAfter = (firstBounce !== null && result && result.duration > firstBounce)
    ? firstBounce : undefined;

  // Botón compacto para alternar el encuadre de los sismogramas (B1).
  const FitToggle = () => (
    <button
      onClick={() => setFitToEvent(v => !v)}
      className={`text-[10px] px-2.5 py-1.5 rounded-lg font-bold border ${fitToEvent ? 'bg-[#2D6A4F] text-white border-[#2D6A4F]' : 'bg-white border-stone-200 text-stone-500'}`}
      title={fitToEvent ? 'Mostrando solo el tramo del evento. Clic para ver toda la duración.' : 'Mostrando toda la duración. Clic para ajustar al evento.'}
    >
      {fitToEvent ? 'Ajustar al evento' : 'Duración completa'}
    </button>
  );

  return (
    <div className="min-h-screen bg-[#FAFAF8] pt-16">
      {/* Confirmación para salir del registro real hacia el laboratorio. */}
      {exitRealPrompt && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4" onClick={() => setExitRealPrompt(false)}>
          <div className="bg-white rounded-2xl shadow-xl border border-stone-200 w-full max-w-sm p-5" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-[#1A1A2E] text-sm mb-1">¿Salir del registro real?</h3>
            <p className="text-xs text-stone-500 leading-relaxed mb-4">
              Estás viendo un registro real, cuyos datos no se modifican. Si quieres ajustar el modelo (velocidades, magnitud, profundidad…), pasas al laboratorio de simulación y se cierra el registro real. Podrás volver a cargarlo desde el Explorador.
            </p>
            <div className="flex gap-2">
              <button onClick={() => setExitRealPrompt(false)} className="flex-1 py-2 rounded-xl border border-stone-200 text-stone-500 text-sm font-semibold">
                Seguir en el registro real
              </button>
              <button onClick={confirmExitReal} className="flex-1 py-2 rounded-xl bg-[#C4553A] text-white text-sm font-bold shadow-md shadow-[#C4553A]/20">
                Ir al laboratorio
              </button>
            </div>
          </div>
        </div>
      )}
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
                  onClick={() => launchTour()}
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

      <div className="max-w-[1440px] mx-auto px-4 pt-3 pb-3">
        <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr_300px] gap-4 items-start">
          {/* Columna de parámetros: sticky en desktop, sin recortar contenido.
              Con acordeón exclusivo el contenido es corto; si una sección larga
              excede la altura, hay scroll interno suave (nunca corte). */}
          <div className="lg:h-[calc(100dvh-132px)] lg:sticky lg:top-16">
            <ParametersPanel params={params} onChange={handleParamsChange} onRun={handleRunGuarded} loading={loading} locked={Boolean(realData)} forceSection={tourParam} firstBounceS={result?.gridInfo.firstBounceS ?? null} firstBounceP={result?.gridInfo.firstBounceP ?? null} />
          </div>

          <div className="flex flex-col gap-4 lg:pr-1">
            {/* Fondo oscuro cuando la Visualización está ampliada (clic para cerrar). */}
            {vizExpanded && (
              <div className="fixed inset-0 z-[110] bg-[#1A1A2E]/50" onClick={() => setVizExpanded(false)} />
            )}
            <div
              data-viz-area
              data-tour="viz-area"
              className={vizExpanded
                ? 'fixed inset-2 sm:inset-4 z-[120] bg-white rounded-2xl border border-stone-200/60 shadow-2xl p-4 overflow-y-auto scrollbar-thin'
                : 'bg-white rounded-xl border border-stone-200/60 shadow-sm p-4'}
            >
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
                    data-tour="tab-2d"
                    onClick={() => setViewMode('2d')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                      viewMode === '2d' ? 'bg-white text-[#C4553A] shadow-sm' : 'text-stone-400'
                    }`}
                  >
                    <Waves size={13} /> <Tooltip content="Sismogramas triaxiales (Norte, Este, Vertical)">Sismogramas</Tooltip>
                  </button>
                  {/* El mapa de calor y el movimiento de partícula solo aplican
                      a una simulación del laboratorio. Con un registro real
                      cargado se ocultan: solo se muestra el sismograma real. */}
                  {!realData && (
                    <>
                      <button
                        data-tour="tab-triaxial"
                        onClick={() => setViewMode('triaxial')}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                          viewMode === 'triaxial' ? 'bg-white text-[#C4553A] shadow-sm' : 'text-stone-400'
                        }`}
                      >
                        <Grid3X3 size={13} /> <Tooltip content="Mapa de calor del subsuelo (corte vertical)">Mapa de calor</Tooltip>
                      </button>
                      <button
                        data-tour="tab-particle"
                        onClick={() => setViewMode('particle')}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                          viewMode === 'particle' ? 'bg-white text-[#C4553A] shadow-sm' : 'text-stone-400'
                        }`}
                      >
                        <Box size={13} /> <Tooltip content="Movimiento de partícula (trayectoria 3D del suelo)">Partícula</Tooltip>
                      </button>
                    </>
                  )}
                  {/* Ampliar/Reducir: abre la Visualización casi a pantalla
                      completa (sin scroll de la página) y vuelve al tamaño normal. */}
                  <button
                    onClick={() => setVizExpanded(v => !v)}
                    aria-label={vizExpanded ? 'Reducir' : 'Ampliar'}
                    className="flex items-center justify-center w-8 h-8 rounded-md text-stone-400 hover:text-[#C4553A] hover:bg-white transition-colors"
                  >
                    <Tooltip content={vizExpanded ? 'Reducir la vista' : 'Ampliar a pantalla completa'}>
                      {vizExpanded ? <Minimize size={14} /> : <Maximize size={14} />}
                    </Tooltip>
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
                    <button onClick={() => { setRealData(null); setRealParams(null); setWave2dPlaying(false); }} className="text-[10px] text-stone-400 px-2 py-1 rounded bg-white border border-stone-200">
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
                      {[0.5, 1, 2, 4].map(s => (
                        <button key={s} onClick={() => setWave2dSpeed(s)}
                          className={`text-[10px] px-2.5 py-1.5 rounded-lg font-bold ${wave2dSpeed === s ? 'bg-[#C4553A] text-white' : 'bg-white border border-stone-200 text-stone-400'}`}>{s}x</button>
                      ))}
                    </div>
                    <FitToggle />
                  </div>

                  <div className="bg-stone-50 rounded-lg p-3 border border-stone-100">
                    <div className="flex gap-4 text-xs text-stone-500 mb-3">
                      <span className="flex items-center gap-1"><span className="w-2 h-0.5 bg-[#C4553A] inline-block" /> Norte</span>
                      <span className="flex items-center gap-1"><span className="w-2 h-0.5 bg-[#2D6A4F] inline-block" /> Este</span>
                      <span className="flex items-center gap-1"><span className="w-2 h-0.5 bg-[#D4A853] inline-block" /> Vertical</span>
                    </div>
                    <WaveChart data={realData.waveData} label="Norte (N)" component="north" color="#C4553A" height={76} visibleRatio={wave2dRatio} robustScale windowStart={realWin?.start} windowEnd={realWin?.end} />
                  </div>
                  <div className="bg-stone-50 rounded-lg p-3 border border-stone-100">
                    <WaveChart data={realData.waveData} label="Este (E)" component="east" color="#2D6A4F" height={76} visibleRatio={wave2dRatio} robustScale windowStart={realWin?.start} windowEnd={realWin?.end} />
                  </div>
                  <div className="bg-stone-50 rounded-lg p-3 border border-stone-100">
                    <WaveChart data={realData.waveData} label="Vertical (Z)" component="vertical" color="#D4A853" height={76} visibleRatio={wave2dRatio} robustScale windowStart={realWin?.start} windowEnd={realWin?.end} />
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
                      {[0.5, 1, 2, 4].map(s => (
                        <button key={s} onClick={() => setWave2dSpeed(s)}
                          className={`text-[10px] px-2.5 py-1.5 rounded-lg font-bold ${wave2dSpeed === s ? 'bg-[#C4553A] text-white' : 'bg-white border border-stone-200 text-stone-400'}`}>{s}x</button>
                      ))}
                    </div>
                    <FitToggle />
                  </div>

                  {/* Aviso de reflexiones de borde: solo si la ventana supera el
                      primer rebote (el MENOR entre P y S). Con el dominio grande
                      y la duración acotada normalmente NO aparece. Si el rebote
                      queda fuera de la ventana mostrada, no se menciona la línea
                      punteada (no se ve) y se aclara "(fuera de la ventana
                      mostrada)". */}
                  {firstBounce !== null && result.duration > firstBounce + 0.05 && (
                    <div className="flex items-start gap-2 bg-[#C4553A]/5 border border-[#C4553A]/20 rounded-xl p-2.5 text-[11px] text-[#C4553A]">
                      <Info size={14} className="mt-0.5 shrink-0" />
                      {(!simWin || firstBounce <= simWin.end)
                        ? <span>Después de {firstBounce.toFixed(1)} s aparecen reflexiones artificiales en los bordes del modelo; no las interpretes como señal real (marcadas con la línea punteada).</span>
                        : <span>Después de {firstBounce.toFixed(1)} s aparecen reflexiones artificiales en los bordes del modelo (fuera de la ventana mostrada); no las interpretes como señal real.</span>}
                    </div>
                  )}
                  {/* Aviso si el backend acotó la duración al primer rebote de
                      borde (la duración pedida habría incluido reflexiones). */}
                  {result.gridInfo.durationCappedByBounce && (
                    <div className="flex items-start gap-2 bg-stone-100 border border-stone-200 rounded-xl p-2.5 text-[11px] text-stone-500">
                      <Info size={14} className="mt-0.5 shrink-0" />
                      <span>La duración se ajustó a {result.duration.toFixed(1)} s, antes del primer rebote de borde del modelo, para no incluir reflexiones artificiales.</span>
                    </div>
                  )}

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

                  <div className="bg-stone-50 rounded-lg p-2 border border-stone-100">
                    <WaveChart data={result.waveData} label="Norte (N)" component="north" color="#C4553A" height={76} visibleRatio={wave2dRatio} pArrival={result.pArrival} sArrival={result.sArrival} refAmpOverride={ampScale === 'common' ? commonMaxAmplitude(result.waveData) : undefined} reflectionsAfter={reflAfter} windowStart={simWin?.start} windowEnd={simWin?.end} />
                  </div>
                  <div className="bg-stone-50 rounded-lg p-2 border border-stone-100">
                    <WaveChart data={result.waveData} label="Este (E)" component="east" color="#2D6A4F" height={76} visibleRatio={wave2dRatio} pArrival={result.pArrival} sArrival={result.sArrival} refAmpOverride={ampScale === 'common' ? commonMaxAmplitude(result.waveData) : undefined} reflectionsAfter={reflAfter} windowStart={simWin?.start} windowEnd={simWin?.end} />
                  </div>
                  <div className="bg-stone-50 rounded-lg p-2 border border-stone-100">
                    <WaveChart data={result.waveData} label="Vertical (Z)" component="vertical" color="#D4A853" height={76} visibleRatio={wave2dRatio} pArrival={result.pArrival} sArrival={result.sArrival} refAmpOverride={ampScale === 'common' ? commonMaxAmplitude(result.waveData) : undefined} reflectionsAfter={reflAfter} windowStart={simWin?.start} windowEnd={simWin?.end} />
                  </div>
                </div>
              )}

              {/* Corte del subsuelo (solo para simulaciones del laboratorio: un
                  registro real no tiene estas pestañas). */}
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
              {!loading && result && viewMode === 'particle' && (() => {
                const pmWave = result.waveData;
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
                        {[0.5, 1, 2, 4].map(sp => (
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

          </div>

          {/* Columna de resultados: sticky con altura acotada. El scroll vive
              DENTRO de ResultsPanel (zona de acordeones), para que los botones
              de exportación queden fijos abajo, siempre visibles. */}
          <div data-tour="results-panel" className="lg:h-[calc(100dvh-132px)] lg:sticky lg:top-16">
            <ResultsPanel result={result} realRecord={realData} realParams={realParams} forceSection={tourResult} ampScale={ampScale} heatmapGrid={heatmapGrid} />
          </div>
        </div>
      </div>
    </div>
  );
}
