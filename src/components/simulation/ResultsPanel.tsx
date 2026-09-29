import { useState, useEffect } from 'react';
import { SimulationResult, WaveData, GridInfo } from '../../lib/types';
import { Download, FileText, Grid3X3, Image, FileDown } from '../../lib/icons';
import { interpretSimulation } from '../../lib/interpretation';
import { epicentralDistanceKm, epicentralDistanceLabel, formatBigInt } from '../../lib/format';
import { downloadReportPdf, downsampleWave, PdfSections, CrossSectionData } from '../../lib/reportPdf';
import { renderCrossSectionPng, computeGlobalPeak } from '../../lib/crossSectionRender';
import { renderParticleMotionPng } from '../../lib/particleMotionRender';
import { exportPNG } from '../../lib/exportImage';
import { AccordionSection } from './AccordionSection';
import { Tooltip } from '../ui/Tooltip';

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

function interpretResult(result: SimulationResult): string {
  return interpretSimulation(result);
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
  const frames = picks.map(p => {
    const idx = nearest(p.t);
    const dataUrl = renderCrossSectionPng({
      snapshot: snaps[idx], gridInfo: heatmapGrid, fullGrid: result.gridInfo,
      vp: result.params.vp, vs: result.params.vs, layer: 'mag', scaleMode: 'global', globalPeak,
      sourceDelay: result.gridInfo.sourceDelay ?? heatmapGrid.sourceDelay ?? 0,
    });
    return { time: snaps[idx].time, label: p.label, dataUrl };
  });
  return {
    frames,
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
  await downloadReportPdf({
    title,
    params,
    sections,
    results: {
      maxAmplitude: result.maxAmplitude,
      duration: result.duration,
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
  // Acordeón exclusivo: solo una sección abierta a la vez en esta columna.
  const [openSection, setOpenSection] = useState<ResultSection>('metricas');
  const toggle = (s: ResultSection) => setOpenSection(prev => (prev === s ? ('' as ResultSection) : s));

  // Diálogo de opciones del PDF: qué secciones incluir (todas por defecto).
  const [pdfDialog, setPdfDialog] = useState(false);
  const [pdfSections, setPdfSections] = useState<PdfSections>({
    params: true, metrics: true, seismograms: true, crossSection: true, particleMotion: true, interpretation: true,
  });
  const [pdfBusy, setPdfBusy] = useState(false);
  // Con registro real no hay corte del subsuelo propio de esa señal.
  const canCrossSection = Boolean(result && result.snapshots.length && !realRecord);
  // El movimiento de partícula se puede dibujar siempre que haya señal triaxial.
  const canParticleMotion = Boolean(result && (realRecord ? realRecord.waveData : result.waveData)?.time.length);

  // El tour guiado puede forzar la apertura de una sección durante un paso.
  useEffect(() => {
    if (forceSection) setOpenSection(forceSection);
  }, [forceSection]);

  if (!result) {
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
      <AccordionSection title="Métricas" dataTour="sim-metricas" open={openSection === 'metricas'} onToggle={() => toggle('metricas')}>
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: 'Amplitud máx.', value: formatAmplitude(maxAmplitude), tip: 'Pico de amplitud en unidades arbitrarias (la señal no está calibrada). Las gráficas muestran la amplitud normalizada a este pico (±1).' },
            { label: 'Duración', value: `${duration.toFixed(0)} s`, tip: 'Tiempo total del registro sísmico simulado.' },
            { label: 'Frecuencia dominante', value: `${dominantFrequency.toFixed(1)} Hz`, tip: 'Frecuencia principal de la fuente (ondícula de Ricker). Más alta = ondas más cortas y detalladas.' },
            { label: 'Vp/Vs', value: `${(params.vp / params.vs).toFixed(2)}`, tip: 'Relación entre la velocidad de la onda P y la S. Valores típicos rondan 1.7 en la corteza.' },
            { label: 'Arribo de la onda P', value: `${pArrival.toFixed(2)} s${pArrivalDetected ? '' : ' *'}`, tip: 'Instante en que llega la onda P (la más rápida). Un * indica que se estimó teóricamente, no se detectó en la señal.' },
            { label: 'Arribo de la onda S', value: `${sArrival.toFixed(2)} s${sArrivalDetected ? '' : ' *'}`, tip: 'Instante en que llega la onda S (más lenta que la P). La diferencia S−P crece con la distancia al foco.' },
            { label: 'Impedancia', value: `${(impedance / 1e6).toFixed(2)} MRayl`, tip: 'Producto de la densidad por Vp (ρ·Vp). Los contrastes de impedancia generan reflexiones de las ondas.' },
            { label: 'Fotogramas', value: `${result.snapshots.length}`, tip: 'Número de fotogramas del campo de ondas guardados para animar el corte del subsuelo.' },
          ].map(m => (
            <div key={m.label} className="bg-stone-50 rounded-lg p-3 border border-stone-100">
              <div className="text-[10px] text-stone-500 mb-1">
                <Tooltip content={m.tip} showIcon>{m.label}</Tooltip>
              </div>
              <div className="text-sm font-bold text-[#1A1A2E]">{m.value}</div>
            </div>
          ))}
        </div>
        {(!pArrivalDetected || !sArrivalDetected) && (
          <p className="text-[10px] text-stone-500 mt-2 italic">
            {params.sourceType === 'volcanic' && !sArrivalDetected && pArrivalDetected
              // En una fuente volcánica (explosiva, isótropa) casi no hay onda S:
              // el marcador S es el tiempo teórico esperado, no un fallo.
              ? '* Marca el tiempo teórico de la onda S. En una fuente volcánica (explosiva) apenas hay onda S, así que se muestra dónde llegaría.'
              : '* Tiempo teórico del arribo (distancia ÷ velocidad), el esperado para estos parámetros.'}
          </p>
        )}
        <p className="text-[10px] text-stone-400 mt-1">
          Amplitud normalizada (±1) para comparar la forma de las ondas; el pico va en unidades arbitrarias (u.a.).
        </p>
      </AccordionSection>

      {/* Grid info */}
      <AccordionSection title="Malla FDM" icon={<Grid3X3 size={12} />} dataTour="sim-malla" open={openSection === 'malla'} onToggle={() => toggle('malla')}>
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
      <AccordionSection title="Interpretación" icon={<FileText size={12} />} dataTour="sim-interpretacion" open={openSection === 'interpretacion'} onToggle={() => toggle('interpretacion')}>
        <p className="text-xs text-stone-600 leading-relaxed">{interpretResult(result)}</p>
      </AccordionSection>

      {/* Botones de exportación: debajo de los acordeones (no dentro de uno),
          dentro del área scrolleable para que acompañen a los resultados. */}
      <div data-tour="sim-export" className="flex gap-2 pt-1">
        <button onClick={() => exportCSV(result)} className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-stone-200 text-[#1A1A2E] font-semibold text-sm">
          <Download size={14} /> CSV
        </button>
        <button onClick={() => exportPNG()} className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-stone-200 text-[#1A1A2E] font-semibold text-sm">
          <Image size={14} /> PNG
        </button>
        <button onClick={() => setPdfDialog(true)} className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-stone-200 text-[#1A1A2E] font-semibold text-sm">
          <FileDown size={14} /> PDF
        </button>
      </div>
      </div>

      {/* Diálogo de opciones del PDF */}
      {pdfDialog && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4" onClick={() => !pdfBusy && setPdfDialog(false)}>
          <div className="bg-white rounded-2xl shadow-xl border border-stone-200 w-full max-w-sm p-5" onClick={e => e.stopPropagation()}>
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
                {pdfBusy ? 'Generando…' : 'Generar PDF'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
