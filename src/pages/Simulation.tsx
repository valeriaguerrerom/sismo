import { useState, useCallback, useEffect, useRef } from 'react';
import { downsampleWave } from '../lib/reportPdf';
import { SimulationParams, SimulationResult, SimProgress, WavefieldSnapshot, WaveData } from '../lib/types';
import { defaultParams } from '../lib/simulation';
import { ParametersPanel } from '../components/simulation/ParametersPanel';
import { ResultsPanel } from '../components/simulation/ResultsPanel';
import { WaveChart } from '../components/simulation/WaveChart';
import { TriaxialPlane } from '../components/simulation/TriaxialPlane';
import { ProgressBar } from '../components/simulation/ProgressBar';
import { Activity, Info, Waves, Grid3X3, Play, Pause, SkipBack, RotateCcw, Flame, Save, Check, HelpCircle } from '../lib/icons';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { Tooltip } from '../components/ui/Tooltip';
import { startTour } from '../tours/useTour';
import { buildSimulacionSteps, type ParamSectionId, type ResultSectionId } from '../tours/simulacion';

interface Props {
  initialParams?: Partial<SimulationParams> | null;
  onParamsUsed?: () => void;
  /** Datos reales enviados desde el Explorer. `nonce` cambia por cada clic. */
  realLoad?: { waveData: WaveData; label: string; params: Partial<SimulationParams>; nonce: number } | null;
  /** Se llama tras consumir realLoad, para que App lo limpie (evita relanzar). */
  onRealLoadUsed?: () => void;
}

type ViewMode = '2d' | 'triaxial';

export function Simulation({ initialParams, onParamsUsed, realLoad, onRealLoadUsed }: Props) {
  const [params, setParams] = useState<SimulationParams>(() => ({
    ...defaultParams(),
    ...(initialParams ?? {}),
  }));

  useEffect(() => {
    if (initialParams) {
      setParams(p => ({ ...p, ...initialParams }));
      onParamsUsed?.();
    }
  }, [initialParams, onParamsUsed]);

  const [result, setResult] = useState<SimulationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<SimProgress | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('2d');
  const workerRef = useRef<Worker | null>(null);

  // Guardado de reportes
  const { user, markTourSeen } = useAuth();

  // ── Tour guiado (Driver.js) ──
  // Secciones de acordeón que el tour fuerza a abrir en cada paso.
  const [tourParam, setTourParam] = useState<ParamSectionId | null>(null);
  const [tourResult, setTourResult] = useState<ResultSectionId | null>(null);
  const tourRef = useRef(false); // evita relanzar el auto-tour

  const launchTour = useCallback(() => {
    const steps = buildSimulacionSteps({
      openParam: (s) => setTourParam(s),
      openResult: (s) => setTourResult(s),
    });
    startTour(steps, {
      onDone: () => {
        markTourSeen('simulacion');
        setTourParam(null);
        setTourResult(null);
      },
    });
  }, [markTourSeen]);

  // Lanza el tour automáticamente la primera vez que el usuario entra al
  // módulo, tras el primer render (rAF asegura que el DOM ya está pintado).
  useEffect(() => {
    if (tourRef.current || !user) return;
    if (user.tours_vistos?.simulacion) return;
    tourRef.current = true;
    const id = requestAnimationFrame(() => setTimeout(launchTour, 350));
    return () => cancelAnimationFrame(id);
  }, [user, launchTour]);
  const [reportTitle, setReportTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);

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
        },
        waveData: downsampleWave(realData ? realData.waveData : result.waveData, 600),
        isRealRecord: Boolean(realData),
        realLabel: realData?.label,
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
  }, [user, result, reportTitle]);

  // Real data from Galeras .mseed
  const [realData, setRealData] = useState<{ waveData: WaveData; label: string } | null>(null);

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
      setProgress({ step: 0, totalSteps: 1, percent: 0 });
    }

    const finish = (r: SimulationResult) => {
      setResult(r);
      if (!background) {
        setLoading(false);
        setProgress(null);
        setWave2dRatio(0);
        setWave2dPlaying(true);
      }
    };

    const runMainThread = () => {
      import('../lib/simulation').then(({ runFDM }) => {
        setTimeout(() => {
          try {
            const res = runFDM(runParams, (step, total) => {
              if (!background) setProgress({ step, totalSteps: total, percent: Math.round((step / total) * 100) });
            });
            finish(res);
          } catch {
            if (!background) { setLoading(false); setProgress(null); }
          }
        }, 50);
      }).catch(() => {
        if (!background) { setLoading(false); setProgress(null); }
      });
    };

    // Web Worker primero; si falla, cae al hilo principal.
    try {
      const worker = new Worker(
        new URL('../lib/simulation.worker.ts', import.meta.url),
        { type: 'module' }
      );
      workerRef.current = worker;

      worker.onmessage = (e) => {
        const msg = e.data;
        if (msg.type === 'progress') {
          if (!background) setProgress({ step: msg.step, totalSteps: msg.totalSteps, percent: msg.percent });
        } else if (msg.type === 'done') {
          const r = msg.result;
          const snapshots: WavefieldSnapshot[] = r.snapshotMeta.map(
            (meta: { time: number; nx: number; nz: number }, i: number) => ({
              time: meta.time, nx: meta.nx, nz: meta.nz,
              field: new Float32Array(r.snapshotFields[i]),
            })
          );
          finish({
            waveData: r.waveData,
            snapshots,
            maxAmplitude: r.maxAmplitude,
            duration: r.duration,
            dominantFrequency: r.dominantFrequency,
            params: r.params,
            gridInfo: r.gridInfo,
            pArrival: r.pArrival,
            sArrival: r.sArrival,
            pArrivalDetected: r.pArrivalDetected,
            sArrivalDetected: r.sArrivalDetected,
          });
          worker.terminate();
        }
      };

      worker.onerror = () => {
        // Si el worker falla (p.ej. no soportado), se cae al hilo principal.
        worker.terminate();
        runMainThread();
      };

      worker.postMessage({ type: 'run', params: runParams });
    } catch {
      runMainThread();
    }
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

  // 2D waveform playback animation
  useEffect(() => {
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
  }, [wave2dPlaying, result, realData, wave2dSpeed]);

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
                  className={`flex items-center justify-center w-6 h-6 rounded-full border border-stone-200 text-stone-400 hover:text-[#C4553A] hover:border-[#C4553A]/40 transition-colors ${user && !user.tours_vistos?.simulacion ? 'help-pulse' : ''}`}
                >
                  <HelpCircle size={14} />
                </button>
              </Tooltip>
            </h1>
            <p className="hidden sm:block text-stone-400 text-[11px] mt-0.5">Diferencias Finitas 2D · Ecuación de Onda Elástica · Pseudo-sismogramas del subsuelo de Nariño</p>
          </div>
          <div className="hidden lg:flex items-center gap-2 bg-stone-50 border border-stone-200/60 rounded-lg px-3 py-1.5 text-xs text-stone-400">
            <Info size={12} />
            Pase el cursor sobre los parámetros para ver su descripción
          </div>
        </div>
      </div>

      <div className="max-w-[1440px] mx-auto px-4 pt-4 pb-6">
        <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr_300px] gap-4 items-start">
          {/* Columna de parámetros: sticky en desktop, sin recortar contenido.
              Con acordeón exclusivo el contenido es corto; si una sección larga
              excede la altura, hay scroll interno suave (nunca corte). */}
          <div className="h-[calc(100dvh-154px)] lg:sticky lg:top-16">
            <ParametersPanel params={params} onChange={setParams} onRun={handleRun} loading={loading} forceSection={tourParam} />
          </div>

          <div className="flex flex-col gap-4 lg:max-h-[calc(100dvh-154px)] lg:overflow-y-auto scrollbar-thin lg:pr-1">
            <div data-viz-area data-tour="viz-area" className="bg-white rounded-xl border border-stone-200/60 shadow-sm p-4">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="font-bold text-[#1A1A2E]">Visualización</h2>
                  <p className="text-xs text-stone-400 mt-0.5">
                    {viewMode === '2d' && 'Sismogramas triaxiales · Componentes N · E · Z'}
                    {viewMode === 'triaxial' && 'Mapa de calor · Propagación del campo de onda · Ux · Uz · |u|'}
                  </p>
                </div>
                {/* View toggle */}
                <div className="flex bg-stone-100 rounded-lg p-0.5">
                  <button
                    onClick={() => setViewMode('2d')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                      viewMode === '2d' ? 'bg-white text-[#C4553A] shadow-sm' : 'text-stone-400'
                    }`}
                  >
                    <Waves size={13} /> Sismogramas
                  </button>
                  <button
                    onClick={() => setViewMode('triaxial')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                      viewMode === 'triaxial' ? 'bg-white text-[#C4553A] shadow-sm' : 'text-stone-400'
                    }`}
                  >
                    <Grid3X3 size={13} /> Mapa de calor
                  </button>
                </div>
              </div>

              {/* Progress bar */}
              {loading && progress && <ProgressBar progress={progress} />}

              {/* Empty state (compacto: no reserva altura enorme) */}
              {!loading && !result && !realData && (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <div className="w-14 h-14 rounded-2xl bg-stone-100 flex items-center justify-center mb-3">
                    <Activity size={26} className="text-stone-300" />
                  </div>
                  <h3 className="font-semibold text-stone-400 mb-1">Esperando simulación</h3>
                  <p className="text-stone-400 text-sm max-w-xs leading-relaxed">
                    Configure los parámetros y presione "Generar Pseudo-Sismograma"
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
                        {' '}El mapa de calor de la propagación con parámetros equivalentes se genera automáticamente; véalo en la pestaña "Mapa de calor".
                      </p>
                    </div>
                    <button onClick={() => setRealData(null)} className="text-[10px] text-stone-400 px-2 py-1 rounded bg-white border border-stone-200">
                      Cerrar
                    </button>
                  </div>

                  {/* Playback controls for real data */}
                  <div className="flex items-center gap-3 bg-stone-50 rounded-xl p-2.5 border border-stone-100">
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
                      className="flex-1"
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
                      <span className="flex items-center gap-1"><span className="w-2 h-0.5 bg-[#2D6A4F] inline-block" /> Norte</span>
                      <span className="flex items-center gap-1"><span className="w-2 h-0.5 bg-[#C4553A] inline-block" /> Este</span>
                      <span className="flex items-center gap-1"><span className="w-2 h-0.5 bg-[#D4A853] inline-block" /> Vertical</span>
                    </div>
                    <WaveChart data={realData.waveData} label="Norte (N)" component="north" color="#2D6A4F" height={110} visibleRatio={wave2dRatio} robustScale />
                  </div>
                  <div className="bg-stone-50 rounded-lg p-3 border border-stone-100">
                    <WaveChart data={realData.waveData} label="Este (E)" component="east" color="#C4553A" height={110} visibleRatio={wave2dRatio} robustScale />
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
                  <div className="flex items-center gap-3 bg-stone-50 rounded-xl p-2.5 border border-stone-100">
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
                      className="flex-1"
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

                  <div className="bg-stone-50 rounded-lg p-3 border border-stone-100">
                    <div className="flex gap-4 text-xs text-stone-500 mb-3">
                      <span className="flex items-center gap-1"><span className="w-2 h-0.5 bg-[#2D6A4F] inline-block" /> Norte</span>
                      <span className="flex items-center gap-1"><span className="w-2 h-0.5 bg-[#C4553A] inline-block" /> Este</span>
                      <span className="flex items-center gap-1"><span className="w-2 h-0.5 bg-[#D4A853] inline-block" /> Vertical</span>
                    </div>
                    <WaveChart data={result.waveData} label="Norte (N)" component="north" color="#2D6A4F" height={110} visibleRatio={wave2dRatio} pArrival={result.pArrival} sArrival={result.sArrival} />
                  </div>
                  <div className="bg-stone-50 rounded-lg p-3 border border-stone-100">
                    <WaveChart data={result.waveData} label="Este (E)" component="east" color="#C4553A" height={110} visibleRatio={wave2dRatio} pArrival={result.pArrival} sArrival={result.sArrival} />
                  </div>
                  <div className="bg-stone-50 rounded-lg p-3 border border-stone-100">
                    <WaveChart data={result.waveData} label="Vertical (Z)" component="vertical" color="#D4A853" height={110} visibleRatio={wave2dRatio} pArrival={result.pArrival} sArrival={result.sArrival} />
                  </div>
                </div>
              )}

              {/* Triaxial plane view */}
              {!loading && result && viewMode === 'triaxial' && (
                <TriaxialPlane
                  snapshots={result.snapshots}
                  gridInfo={result.gridInfo}
                  maxAmplitude={result.maxAmplitude}
                />
              )}

            </div>

            {/* Quick stats */}
            {result && (
              <div className="grid grid-cols-4 gap-3">
                {[
                  { label: 'Método', value: 'FDM 2D', color: 'text-[#2D6A4F]' },
                  { label: 'Malla', value: `${result.gridInfo.nx}×${result.gridInfo.nz}`, color: 'text-[#6B5B95]' },
                  { label: 'Fuente', value: result.params.sourceType === 'volcanic' ? 'Volcánica' : 'Tectónica', color: result.params.sourceType === 'volcanic' ? 'text-[#C4553A]' : 'text-[#2D6A4F]' },
                  { label: 'Vp/Vs', value: `${(result.params.vp / result.params.vs).toFixed(2)}`, color: 'text-[#1A1A2E]' },
                ].map(stat => (
                  <div key={stat.label} className="bg-white rounded-xl border border-stone-200/60 p-3 shadow-sm text-center">
                    <div className={`text-lg font-black ${stat.color}`}>{stat.value}</div>
                    <div className="text-[10px] text-stone-400 uppercase tracking-wide mt-0.5">{stat.label}</div>
                  </div>
                ))}
              </div>
            )}

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
          <div data-tour="results-panel" className="h-[calc(100dvh-154px)] lg:sticky lg:top-16">
            <ResultsPanel result={result} realRecord={realData} forceSection={tourResult} />
          </div>
        </div>
      </div>
    </div>
  );
}
