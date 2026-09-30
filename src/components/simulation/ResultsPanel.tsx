import { useState, useEffect } from 'react';
import { SimulationResult, WaveData, GridInfo, SimulationParams } from '../../lib/types';
import { Download, FileText, Grid3X3, Image, FileDown, Save, Check, Info } from '../../lib/icons';
import { interpretSimulation, sourceFreqAdjustedNote } from '../../lib/interpretation';
import { computeEventWindow } from '../../lib/waveWindow';
import { epicentralDistanceKm, epicentralDistanceLabel, formatBigInt } from '../../lib/format';
import { downloadReportPdf, downsampleWave, PdfSections, CrossSectionData } from '../../lib/reportPdf';
import { renderCrossSectionPng, computeGlobalPeak, fontScaleForPdf } from '../../lib/crossSectionRender';
import { renderParticleMotionPng } from '../../lib/particleMotionRender';
import { exportPNG } from '../../lib/exportImage';
import { AccordionSection } from './AccordionSection';
import { Tooltip } from '../ui/Tooltip';
import { VolcanoLoader } from '../ui/VolcanoLoader';
import { useAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';

/** Identificadores de las secciones del panel de resultados. */
type ResultSection = 'metricas' | 'malla' | 'interpretacion';

/** Registro real cargado en el simulador (para que el reporte lo use). */
export interface RealRecordInfo { waveData: WaveData; label: string; }

interface Props {
  result: SimulationResult | null;
  /** Si hay un registro real cargado, el PDF muestra esa señal (no el FDM). */
  realRecord?: RealRecordInfo | null;
  /** Sección que el tour guiado quiere abrir (cambia por paso). */
  forceSection?: ResultSection | null;
  /** Escala de amplitud elegida en el Simulador; el PDF la replica. */
  ampScale?: 'common' | 'component';
  /** Grid submuestreado del corte (posiciones fuente/receptor reescaladas). */
  heatmapGrid?: GridInfo | null;
}

function exportCSV(result: SimulationResult) {
  const { waveData } = result;
  const rows = ['time_s,north_rel,east_rel,vertical_rel'];
  for (let i = 0; i < waveData.time.length; i++) {
    rows.push(`${waveData.time[i].toFixed(4)},${waveData.north[i].toExponential(6)},${waveData.east[i].toExponential(6)},${waveData.vertical[i].toExponential(6)}`);
  }
  const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'sismograma_narino.csv';
  a.click();
  URL.revokeObjectURL(url);
}

function formatAmplitude(maxAmplitude: number): string {
  // La señal no está calibrada: se reporta el pico en unidades arbitrarias
  // (u.a.). Las gráficas muestran la amplitud normalizada a este pico (±1).
  return maxAmplitude.toExponential(2) + ' u.a.';
}

function interpretResult(result: SimulationResult, realRecord?: RealRecordInfo | null): string {
  const realDuration = realRecord?.waveData.time.length
    ? (realRecord.waveData.time[realRecord.waveData.time.length - 1] ?? undefined)
    : undefined;
  return interpretSimulation({
    ...result,
    isRealRecord: Boolean(realRecord),
    realLabel: realRecord?.label,
    realDuration,
  });
}

/**
 * Construye los tres fotogramas del corte del subsuelo para el PDF: llegada de
 * la P, llegada de la S y un momento después de la S. Devuelve null si no hay
 * fotogramas o falta el grid del corte.
 */
function buildCrossSectionFrames(
  result: SimulationResult,
  heatmapGrid: GridInfo | null | undefined,
): CrossSectionData | undefined {
  const snaps = result.snapshots;
  if (!snaps || !snaps.length || !heatmapGrid) return undefined;
  const lastT = snaps[snaps.length - 1].time;
  const nearest = (t: number) => {
    let best = 0, bestD = Infinity;
    for (let i = 0; i < snaps.length; i++) { const d = Math.abs(snaps[i].time - t); if (d < bestD) { bestD = d; best = i; } }
    return best;
  };
  const afterS = Math.min(lastT, result.sArrival + (result.sArrival - result.pArrival) + 0.5);
  const picks: { t: number; label: string }[] = [
    { t: result.pArrival, label: 'La onda P alcanza la estación' },
    { t: result.sArrival, label: 'La onda S alcanza la estación' },
    { t: afterS, label: 'Un momento después de la S' },
  ];
  // Escala GLOBAL (mismo criterio que en pantalla): pico de la magnitud sobre
  // todos los fotogramas, para que los residuos tardíos se vean tenues.
  const globalPeak = computeGlobalPeak(snaps, 'mag');
  // Disposición 2 + 1 en el PDF (dos arriba, uno centrado abajo más grande),
  // para que los rótulos de los ejes se lean a ≥7 pt en la página impresa. Cada
  // fotograma se rinde con una escala tipográfica acorde a SU ancho impreso.
  // Anchos impresos (mm) coordinados con reportPdfBuilder (CONTENT_W = 180).
  const TOP_MM = (180 - 4) / 2;   // dos arriba con 4 mm de separación
  const BOTTOM_MM = 118;          // uno abajo, centrado, mayor
  const layoutMm = [TOP_MM, TOP_MM, BOTTOM_MM];
  const frames = picks.map((p, i) => {
    const idx = nearest(p.t);
    const imgMm = layoutMm[i] ?? TOP_MM;
    const twoLayer = result.params.subsurfaceModel === 'twoLayer';
    const dataUrl = renderCrossSectionPng({
      snapshot: snaps[idx], gridInfo: heatmapGrid, fullGrid: result.gridInfo,
      vp: result.params.vp, vs: result.params.vs, layer: 'mag', scaleMode: 'global', globalPeak,
      sourceDelay: result.gridInfo.sourceDelay ?? heatmapGrid.sourceDelay ?? 0,
      fontScale: fontScaleForPdf(imgMm, 7),
      interfaceZ: twoLayer ? (heatmapGrid.interfaceZ ?? 0) : 0,
      layerTopName: twoLayer ? 'Capa superficial (depósitos)' : undefined,
      layerBottomName: twoLayer ? 'Semiespacio (roca)' : undefined,
    });
    return { time: snaps[idx].time, label: p.label, dataUrl };
  });
  return {
    frames,
    layout: '2plus1',
    component: 'Magnitud del movimiento |u| (combina radial y vertical)',
    caption: 'Corte vertical del subsuelo. Muestra el movimiento en el plano vertical (radial y vertical); la componente transversal (SH) se ve en los sismogramas. La zona gris de los bordes es la capa absorbente y no forma parte del modelo. La escala de color es global (igual para todos los fotogramas), así los residuos tardíos se ven tenues.',
  };
}

/**
 * Exporta el reporte PDF (RF-19) con las secciones elegidas. Si hay un registro
 * real cargado, el PDF muestra esa señal (la misma que la pantalla), no el
 * pseudo-sismograma FDM. El corte del subsuelo solo se incluye si se marcó y
 * hay fotogramas disponibles.
 */
async function exportPDF(
  result: SimulationResult,
  sections: PdfSections,
  realRecord?: RealRecordInfo | null,
  ampScale: 'common' | 'component' = 'common',
  heatmapGrid?: GridInfo | null,
) {
  const { params } = result;
  const title = realRecord
    ? `Registro real ${realRecord.label}`
    : `Simulación ${params.sourceType === 'volcanic' ? 'volcánica' : 'tectónica'} Mw ${params.magnitude.toFixed(1)}`;
  // El corte solo aplica a la simulación (no a un registro real cargado).
  const crossSection = (sections.crossSection && !realRecord)
    ? buildCrossSectionFrames(result, heatmapGrid)
    : undefined;
  // Movimiento de partícula: usa la señal que ve el usuario (real si está
  // cargada, o el pseudo-sismograma FDM) y los arribos de la simulación.
  let particleMotion: { dataUrl: string; caption: string } | undefined;
  if (sections.particleMotion) {
    const pmWave = realRecord ? realRecord.waveData : result.waveData;
    if (pmWave && pmWave.time.length) {
      particleMotion = {
        dataUrl: renderParticleMotionPng({
          waveData: pmWave,
          pArrival: realRecord ? 0 : result.pArrival,
          sArrival: realRecord ? 0 : result.sArrival,
        }),
        caption: 'Trayectoria 3D del suelo en la estación (Norte, Este, Vertical), con las tres componentes a la misma escala. La onda P mueve el suelo en la dirección de propagación; la S, de forma perpendicular.',
      };
    }
  }
  // Con registro real, la "duración registrada" y los ejes son los del REGISTRO
  // REAL (no los de la simulación de apoyo del mapa de calor, que se acota al
  // primer rebote). Así el PDF es coherente con la señal mostrada.
  const realDur = realRecord?.waveData.time.length
    ? (realRecord.waveData.time[realRecord.waveData.time.length - 1] ?? result.duration)
    : result.duration;
  await downloadReportPdf({
    title,
    params,
    sections,
    results: {
      maxAmplitude: result.maxAmplitude,
      duration: realRecord ? realDur : result.duration,
      dominantFrequency: result.dominantFrequency,
      pArrival: result.pArrival,
      sArrival: result.sArrival,
      pArrivalDetected: result.pArrivalDetected,
      sArrivalDetected: result.sArrivalDetected,
      gridInfo: { ...result.gridInfo, epicentralDistanceKm: epicentralDistanceKm(result.gridInfo) },
      // Con registro real: la señal real que se ve en pantalla, sin marcas P/S.
      waveData: downsampleWave(realRecord ? realRecord.waveData : result.waveData, 1200),
      isRealRecord: Boolean(realRecord),
      realLabel: realRecord?.label,
      ampScale,
      crossSection,
      particleMotion,
    },
  }, 'sismograma_narino');
}

export function ResultsPanel({ result, realRecord, forceSection, ampScale = 'common', heatmapGrid }: Props) {
  // Acordeón EXCLUSIVO: solo una sección abierta a la vez (al abrir una se
  // cierran las demás), para que siempre quepa sin scroll. Al inicio solo
  // "Métricas" está abierta.
  const [openSections, setOpenSections] = useState<Set<ResultSection>>(new Set(['metricas']));
  const toggle = (s: ResultSection) => setOpenSections(prev => (
    prev.has(s) ? new Set<ResultSection>() : new Set<ResultSection>([s])
  ));

  // Diálogo de opciones del PDF: qué secciones incluir (todas por defecto).
  const [pdfDialog, setPdfDialog] = useState(false);
  const [pdfSections, setPdfSections] = useState<PdfSections>({
    params: true, metrics: true, seismograms: true, crossSection: true, particleMotion: true, interpretation: true,
  });
  const [pdfBusy, setPdfBusy] = useState(false);

  // ── Guardar como reporte (obligatorio ANTES de exportar) ──
  const { user } = useAuth();
  const [reportTitle, setReportTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);
  // Solo tras guardar el reporte se habilitan las descargas (CSV/PNG/PDF).
  const [hasSaved, setHasSaved] = useState(false);

  // Al cambiar la simulación, se vuelve a exigir guardar antes de exportar.
  useEffect(() => {
    setHasSaved(false);
    setSaveMsg(null);
    setReportTitle('');
  }, [result]);

  const handleSaveReport = async () => {
    if (!supabase || !user || !result) return;
    setSaving(true);
    setSaveMsg(null);
    const title = reportTitle.trim() || (realRecord
      ? `Registro real ${realRecord.label}`
      : `Simulación ${result.params.sourceType === 'volcanic' ? 'volcánica' : 'tectónica'} Mw ${result.params.magnitude}`);
    const { error } = await supabase.from('simulation_reports').insert({
      user_id: user.id,
      title,
      params: result.params as SimulationParams,
      results: {
        maxAmplitude: result.maxAmplitude,
        // Con registro real, la duración guardada es la del REGISTRO (no la de
        // la simulación de apoyo, acotada al primer rebote).
        duration: realRecord?.waveData.time.length
          ? (realRecord.waveData.time[realRecord.waveData.time.length - 1] ?? result.duration)
          : result.duration,
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
          firstBounceP: result.gridInfo.firstBounceP,
          firstBounceS: result.gridInfo.firstBounceS,
        },
        waveData: downsampleWave(realRecord ? realRecord.waveData : result.waveData, 600),
        isRealRecord: Boolean(realRecord),
        realLabel: realRecord?.label,
        ampScale,
      },
    });
    if (error) {
      setSaveMsg({ type: 'error', text: 'No se pudo guardar el reporte. Inténtalo de nuevo.' });
      console.error('Error guardando reporte:', error.message);
    } else {
      setSaveMsg({ type: 'ok', text: '¡Guardado! Ya puedes descargar y verlo en "Mis Reportes".' });
      setHasSaved(true);
    }
    setSaving(false);
  };

  // Con registro real no hay corte del subsuelo propio de esa señal.
  const canCrossSection = Boolean(result && result.snapshots.length && !realRecord);
  // El movimiento de partícula se puede dibujar siempre que haya señal triaxial.
  const canParticleMotion = Boolean(result && (realRecord ? realRecord.waveData : result.waveData)?.time.length);

  // El tour guiado puede forzar la apertura de una sección durante un paso.
  useEffect(() => {
    if (forceSection) setOpenSections(new Set([forceSection]));
  }, [forceSection]);

  if (!result) {
    // Con un registro real cargado, la simulación de apoyo (métricas, malla,
    // interpretación y reporte) aún se está calculando: se avisa con el volcán
    // cargando en vez del empty state de "3 pasos" (que no aplica aquí).
    if (realRecord) {
      return (
        <div className="bg-white rounded-xl border border-stone-200/60 shadow-sm p-5 h-full flex flex-col items-center justify-center text-center">
          <VolcanoLoader size={44} label="Preparando el análisis del registro…" />
          <p className="text-[11px] text-stone-400 mt-3 max-w-xs leading-relaxed">
            Con el registro real cargado, se calcula una simulación equivalente para las métricas, el mapa de calor y la interpretación. Tarda unos segundos; el sismograma ya se reproduce a la izquierda.
          </p>
        </div>
      );
    }
    const steps = [
      { n: 1, title: 'Elige un escenario o ajusta el subsuelo', text: 'Parte de un caso listo (sismo andino, volcánico del Galeras…) o mueve las velocidades y la densidad en "Variables elásticas".' },
      { n: 2, title: 'Revisa la fuente', text: 'Define el tipo de fuente, la magnitud, la profundidad y la distancia de la estación en "Fuente sísmica".' },
      { n: 3, title: 'Genera el pseudo-sismograma', text: 'Pulsa "Generar pseudo-sismograma" y aquí aparecerán tus métricas, la malla y la interpretación.' },
    ];
    return (
      <div className="bg-white rounded-xl border border-stone-200/60 shadow-sm p-5 h-full">
        <h3 className="text-sm font-bold text-[#1A1A2E] mb-1">Empieza tu simulación en 3 pasos</h3>
        <p className="text-xs text-stone-500 mb-4 leading-relaxed">Cuando generes tu primer resultado, esta columna mostrará las métricas y la interpretación.</p>
        <ol className="space-y-3">
          {steps.map(s => (
            <li key={s.n} className="flex gap-3">
              <span className="shrink-0 w-6 h-6 rounded-full bg-[#C4553A]/10 text-[#C4553A] text-xs font-bold flex items-center justify-center">{s.n}</span>
              <div>
                <p className="text-xs font-semibold text-[#1A1A2E]">{s.title}</p>
                <p className="text-[11px] text-stone-500 leading-relaxed mt-0.5">{s.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    );
  }

  const { params, maxAmplitude, dominantFrequency, duration, gridInfo, pArrival, sArrival, pArrivalDetected, sArrivalDetected } = result;
  const impedance = params.density * params.vp;

  return (
    <div className="flex flex-col gap-3 h-full min-h-0">
      {/* Zona scrolleable: acordeones. Scrollbar sutil (scrollbar-thin) que en
          escritorio solo se hace notorio al interactuar. */}
      <div className="flex flex-col gap-3 flex-1 min-h-0 overflow-y-auto scrollbar-thin pr-0.5">
      {/* Metrics */}
      <AccordionSection title="Métricas" dataTour="sim-metricas" open={openSections.has('metricas')} onToggle={() => toggle('metricas')}>
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: 'Amplitud máx.', value: formatAmplitude(maxAmplitude), tip: 'Pico de amplitud en unidades arbitrarias (la señal no está calibrada). Las gráficas muestran la amplitud normalizada a este pico (±1) para comparar la forma de las ondas.' },
            { label: 'Duración', value: `${duration.toFixed(0)} s`, tip: 'Tiempo total del registro sísmico simulado.' },
            { label: 'Frecuencia dominante', value: `${dominantFrequency.toFixed(1)} Hz`, tip: 'Frecuencia principal de la fuente (ondícula de Ricker). Más alta = ondas más cortas y detalladas.' },
            { label: 'Vp/Vs', value: `${(params.vp / params.vs).toFixed(2)}`, tip: 'Relación entre la velocidad de la onda P y la S. Valores típicos rondan 1.7 en la corteza.' },
            { label: 'Arribo de la onda P', value: `${pArrival.toFixed(2)} s${pArrivalDetected ? '' : ' *'}`, tip: 'Instante en que llega la onda P (la más rápida). Un * indica que se estimó teóricamente, no se detectó en la señal.' },
            { label: 'Arribo de la onda S', value: `${sArrival.toFixed(2)} s${sArrivalDetected ? '' : ' *'}`, tip: params.sourceType === 'volcanic' ? 'Instante en que llega la onda S. Un * indica valor teórico: en una fuente volcánica (explosiva) apenas hay onda S, así que se muestra dónde llegaría.' : 'Instante en que llega la onda S (más lenta que la P). Un * indica que se estimó teóricamente. La diferencia S−P crece con la distancia al foco.' },
            { label: 'Impedancia', value: `${(impedance / 1e6).toFixed(2)} MRayl`, tip: 'Producto de la densidad por Vp (ρ·Vp). Los contrastes de impedancia generan reflexiones de las ondas.' },
            { label: 'Fotogramas', value: `${result.snapshots.length}`, tip: 'Número de fotogramas del campo de ondas guardados para animar el corte del subsuelo.' },
          ].map(m => (
            <div key={m.label} className="bg-stone-50 rounded-lg p-2 border border-stone-100">
              <div className="text-[10px] text-stone-500 mb-0.5 leading-tight">
                <Tooltip content={m.tip} showIcon>{m.label}</Tooltip>
              </div>
              <div className="text-sm font-bold text-[#1A1A2E]">{m.value}</div>
            </div>
          ))}
        </div>
        {(!pArrivalDetected || !sArrivalDetected) && (
          <p className="text-[10px] text-stone-500 mt-1.5 italic">* Tiempo teórico (distancia ÷ velocidad); ver detalle en el ícono de la métrica.</p>
        )}
        {(() => {
          // Rebote más temprano (menor entre P y S): con roca rápida la P
          // rebota antes en los bordes. Es el tiempo tras el cual pueden
          // aparecer reflexiones artificiales.
          const bs = [gridInfo.firstBounceP, gridInfo.firstBounceS].filter(
            (b): b is number => typeof b === 'number' && b > 0,
          );
          const bounce = bs.length ? Math.min(...bs) : null;
          if (bounce === null || duration <= bounce + 0.05) return null;
          // Si el rebote queda fuera de la ventana del evento (la que se muestra
          // por defecto), se aclara así en vez de sugerir que se ve la marca.
          const win = computeEventWindow(result.waveData, { pArrival, sArrival });
          const outside = bounce > win.end;
          return (
            <p className="text-[10px] text-[#C4553A] mt-1.5 bg-[#C4553A]/5 rounded-lg p-2 border border-[#C4553A]/10">
              Después de {bounce.toFixed(1)} s aparecen reflexiones artificiales en los bordes del modelo{outside ? ' (fuera de la ventana mostrada)' : ''}; no las interpretes como señal real.
            </p>
          );
        })()}
        {/* Nota si la frecuencia de la fuente se bajó por dispersión (dos capas). */}
        {sourceFreqAdjustedNote(params, dominantFrequency) && (
          <p className="text-[10px] text-[#2D6A4F] mt-1.5 bg-[#2D6A4F]/5 rounded-lg p-2 border border-[#2D6A4F]/10">
            {sourceFreqAdjustedNote(params, dominantFrequency)}
          </p>
        )}
      </AccordionSection>

      {/* Grid info */}
      <AccordionSection title="Malla FDM" icon={<Grid3X3 size={12} />} dataTour="sim-malla" open={openSections.has('malla')} onToggle={() => toggle('malla')}>
        <div className="space-y-2">
          {[
            { label: 'Tamaño malla', value: `${gridInfo.nx} × ${gridInfo.nz}`, tip: 'Número de nodos de la malla (horizontal × profundidad) donde se resuelve la ecuación de onda.' },
            { label: 'Resolución (dx)', value: `${gridInfo.dx} m`, tip: 'Distancia entre nodos de la malla. Menor dx = más detalle, pero más costo de cálculo.' },
            { label: 'Paso temporal (dt)', value: `${(gridInfo.dt * 1000).toFixed(2)} ms`, tip: 'Intervalo de tiempo entre pasos de la simulación. Debe cumplir la condición de estabilidad CFL: dt ≤ dx/(Vp·√2).' },
            { label: 'Nodos/λ mín.', value: `${gridInfo.pointsPerWavelength.toFixed(1)}`, tip: 'Cuántos nodos caben en la onda más corta. Se recomiendan al menos 10 para evitar dispersión numérica.' },
            { label: 'Total pasos', value: formatBigInt(gridInfo.totalSteps), tip: 'Número de iteraciones temporales que ejecutó la simulación.' },
            { label: 'Estación virtual', value: epicentralDistanceLabel(gridInfo), tip: 'Distancia horizontal del receptor (estación virtual) al epicentro, en superficie. Se calcula desde la malla: |receptorX − fuenteX| · dx.' },
            { label: 'Fuente', value: params.sourceType === 'volcanic' ? 'Volcánica' : 'Tectónica', tip: 'Mecanismo de la fuente: volcánica (explosión isótropa, más onda P) o tectónica (doble par de cizalla, más onda S).' },
            { label: 'Magnitud', value: `Mw ${params.magnitude.toFixed(1)}`, tip: 'Magnitud momento del evento simulado. Escala logarítmica: +1 equivale a ~32× más energía.' },
          ].map(p => (
            <div key={p.label} className="flex justify-between items-center text-xs">
              <span className="text-stone-500"><Tooltip content={p.tip} showIcon>{p.label}</Tooltip></span>
              <span className="font-semibold text-[#1A1A2E]">{p.value}</span>
            </div>
          ))}
        </div>
      </AccordionSection>

      {/* Interpretation */}
      <AccordionSection title="Interpretación" icon={<FileText size={12} />} dataTour="sim-interpretacion" open={openSections.has('interpretacion')} onToggle={() => toggle('interpretacion')}>
        <p className="text-xs text-stone-600 leading-relaxed">{interpretResult(result, realRecord)}</p>
      </AccordionSection>
      </div>

      {/* Guardar + exportar: FIJOS debajo de los acordeones. Primero se guarda
          como reporte; solo entonces se habilitan las descargas. */}
      <div data-tour="sim-export" className="shrink-0 space-y-2 pt-1">
        {user ? (
          <>
            {/* Paso 1: guardar como reporte (título opcional + botón). */}
            <div className="flex gap-2">
              <input
                type="text"
                value={reportTitle}
                onChange={e => setReportTitle(e.target.value)}
                placeholder={`Simulación ${result.params.sourceType === 'volcanic' ? 'volcánica' : 'tectónica'} Mw ${result.params.magnitude}`}
                className="flex-1 min-w-0 px-3 py-2 rounded-xl border border-stone-200 text-sm focus:outline-none focus:border-[#2D6A4F] bg-stone-50"
              />
              <button
                onClick={handleSaveReport}
                disabled={saving}
                className="flex items-center justify-center gap-2 bg-[#2D6A4F] text-white px-3 py-2 rounded-xl font-bold text-sm shadow-lg shadow-[#2D6A4F]/20 disabled:opacity-50 shrink-0"
              >
                {saving ? 'Guardando…' : hasSaved ? <><Check size={14} /> Guardado</> : <><Save size={14} /> Guardar</>}
              </button>
            </div>
            {saveMsg && (
              <p className={`text-xs rounded-lg p-2 border flex items-center gap-1.5 ${
                saveMsg.type === 'ok' ? 'text-green-600 bg-green-50 border-green-100' : 'text-red-500 bg-red-50 border-red-100'
              }`}>
                {saveMsg.type === 'ok' && <Check size={13} />}
                {saveMsg.text}
              </p>
            )}
            {/* Paso 2: descargas. Deshabilitadas hasta guardar el reporte. */}
            {!hasSaved && (
              <p className="text-[10px] text-stone-400 flex items-center gap-1">
                <Info size={12} /> Guarda el reporte para habilitar las descargas.
              </p>
            )}
            <div className="flex gap-2">
              <button onClick={() => exportCSV(result)} disabled={!hasSaved} className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-stone-200 text-[#1A1A2E] font-semibold text-sm disabled:opacity-40 disabled:cursor-not-allowed">
                <Download size={14} /> CSV
              </button>
              <button onClick={() => exportPNG()} disabled={!hasSaved} className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-stone-200 text-[#1A1A2E] font-semibold text-sm disabled:opacity-40 disabled:cursor-not-allowed">
                <Image size={14} /> PNG
              </button>
              <button onClick={() => setPdfDialog(true)} disabled={!hasSaved} className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-stone-200 text-[#1A1A2E] font-semibold text-sm disabled:opacity-40 disabled:cursor-not-allowed">
                <FileDown size={14} /> PDF
              </button>
            </div>
          </>
        ) : (
          <div className="flex items-center gap-2 text-xs text-stone-400 bg-stone-50 border border-stone-200/60 rounded-xl p-3">
            <Info size={14} className="shrink-0" />
            Inicia sesión para guardar la simulación como reporte y descargarla.
          </div>
        )}
      </div>

      {/* Diálogo de opciones del PDF */}
      {pdfDialog && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4" onClick={() => !pdfBusy && setPdfDialog(false)}>
          <div className="bg-white rounded-2xl shadow-xl border border-stone-200 w-full max-w-sm p-5" onClick={e => e.stopPropagation()}>
            {pdfBusy ? (
              // Mientras se arma el PDF (renderiza el hodograma 3D y los
              // fotogramas del mapa de calor, que tardan unos segundos) se
              // muestra el volcán cargando para que no parezca congelado.
              <div className="flex flex-col items-center justify-center py-6 text-center">
                <VolcanoLoader size={44} label="Generando el reporte PDF…" />
                <p className="text-[11px] text-stone-400 mt-3 max-w-xs leading-relaxed">
                  Renderizando el hodograma y los fotogramas del subsuelo. Tarda unos segundos.
                </p>
              </div>
            ) : (
            <>
            <h3 className="font-bold text-[#1A1A2E] text-sm mb-1 flex items-center gap-2"><FileDown size={16} className="text-[#C4553A]" /> Contenido del PDF</h3>
            <p className="text-[11px] text-stone-500 mb-3">Elige qué secciones incluir.</p>
            <div className="space-y-2">
              {([
                ['params', 'Parámetros'],
                ['metrics', 'Métricas'],
                ['seismograms', 'Sismogramas'],
                ['crossSection', 'Corte del subsuelo'],
                ['particleMotion', 'Movimiento de partícula'],
                ['interpretation', 'Interpretación'],
              ] as [keyof PdfSections, string][]).map(([key, label]) => {
                const disabled = (key === 'crossSection' && !canCrossSection)
                  || (key === 'particleMotion' && !canParticleMotion);
                return (
                  <label key={key} className={`flex items-center gap-2 text-sm ${disabled ? 'opacity-40' : 'text-[#1A1A2E]'}`}>
                    <input
                      type="checkbox"
                      checked={pdfSections[key] && !disabled}
                      disabled={disabled}
                      onChange={e => setPdfSections(s => ({ ...s, [key]: e.target.checked }))}
                      className="accent-[#C4553A] w-4 h-4"
                    />
                    {label}
                    {disabled && <span className="text-[10px] text-stone-400">— Disponible solo al exportar desde el Simulador</span>}
                  </label>
                );
              })}
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setPdfDialog(false)} disabled={pdfBusy} className="flex-1 py-2 rounded-xl border border-stone-200 text-stone-500 text-sm font-semibold">Cancelar</button>
              <button
                onClick={async () => {
                  setPdfBusy(true);
                  // Cede dos frames para que el volcán cargando se pinte ANTES
                  // del render pesado del PDF (que bloquea el hilo principal).
                  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
                  try {
                    await exportPDF(result, { ...pdfSections, crossSection: pdfSections.crossSection && canCrossSection, particleMotion: pdfSections.particleMotion && canParticleMotion }, realRecord, ampScale, heatmapGrid);
                    setPdfDialog(false);
                  } finally {
                    setPdfBusy(false);
                  }
                }}
                disabled={pdfBusy}
                className="flex-1 py-2 rounded-xl bg-[#C4553A] text-white text-sm font-bold shadow-md shadow-[#C4553A]/20 disabled:opacity-60"
              >
                Generar PDF
              </button>
            </div>
            </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
