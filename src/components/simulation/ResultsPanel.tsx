import { useState, useEffect } from 'react';
import { SimulationResult, WaveData, GridInfo } from '../../lib/types';
import { Download, FileText, AlertCircle, Grid3X3, Image, FileDown } from '../../lib/icons';
import { interpretSimulation } from '../../lib/interpretation';
import { epicentralDistanceKm, epicentralDistanceLabel, formatBigInt } from '../../lib/format';
import { downloadReportPdf, downsampleWave, PdfSections, CrossSectionData } from '../../lib/reportPdf';
import { renderCrossSectionPng } from '../../lib/crossSectionRender';
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
    { t: result.pArrival, label: 'Llegada de la onda P a la estación' },
    { t: result.sArrival, label: 'Llegada de la onda S a la estación' },
    { t: afterS, label: 'Un momento después de la S' },
  ];
  const seen = new Set<number>();
  const frames = picks.map(p => {
    const idx = nearest(p.t);
    seen.add(idx);
    const dataUrl = renderCrossSectionPng({
      snapshot: snaps[idx], gridInfo: heatmapGrid, fullGrid: result.gridInfo,
      vp: result.params.vp, vs: result.params.vs,
    });
    return { time: snaps[idx].time, label: p.label, dataUrl };
  });
  return {
    frames,
    caption: 'Corte vertical del subsuelo (capa de magnitud). Muestra el movimiento en el plano vertical (radial y vertical); la componente transversal (SH) se ve en los sismogramas. La zona gris de los bordes es la capa absorbente y no forma parte del modelo.',
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
    params: true, metrics: true, seismograms: true, crossSection: true, interpretation: true,
  });
  const [pdfBusy, setPdfBusy] = useState(false);
  // Con registro real no hay corte del subsuelo propio de esa señal.
  const canCrossSection = Boolean(result && result.snapshots.length && !realRecord);

  // El tour guiado puede forzar la apertura de una sección durante un paso.
  useEffect(() => {
    if (forceSection) setOpenSection(forceSection);
  }, [forceSection]);

  if (!result) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-6">
        <div className="w-16 h-16 rounded-2xl bg-stone-100 flex items-center justify-center mb-4">
          <AlertCircle size={28} className="text-stone-400" />
        </div>
        <h3 className="text-sm font-semibold text-stone-500 mb-2">Sin resultados</h3>
        <p className="text-xs text-stone-500 leading-relaxed">Configure los parámetros y presione "Generar Pseudo-Sismograma".</p>
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
            { label: 'Amplitud Máx.', value: formatAmplitude(maxAmplitude), tip: 'Pico de amplitud en unidades arbitrarias (la señal no está calibrada). Las gráficas muestran la amplitud normalizada a este pico (±1).' },
            { label: 'Duración', value: `${duration.toFixed(0)} s`, tip: 'Tiempo total del registro sísmico simulado.' },
            { label: 'Frec. Dominante', value: `${dominantFrequency.toFixed(1)} Hz`, tip: 'Frecuencia principal de la fuente (ondícula de Ricker). Más alta = ondas más cortas y detalladas.' },
            { label: 'Vp/Vs', value: `${(params.vp / params.vs).toFixed(2)}`, tip: 'Relación entre la velocidad de la onda P y la S. Valores típicos rondan 1.7 en la corteza.' },
            { label: 'Arribo Onda P', value: `${pArrival.toFixed(2)} s${pArrivalDetected ? '' : ' *'}`, tip: 'Instante en que llega la onda P (la más rápida). Un * indica que se estimó teóricamente, no se detectó en la señal.' },
            { label: 'Arribo Onda S', value: `${sArrival.toFixed(2)} s${sArrivalDetected ? '' : ' *'}`, tip: 'Instante en que llega la onda S (más lenta que la P). La diferencia S−P crece con la distancia al foco.' },
            { label: 'Impedancia', value: `${(impedance / 1e6).toFixed(2)} MRayl`, tip: 'Producto de la densidad por Vp (ρ·Vp). Los contrastes de impedancia generan reflexiones de las ondas.' },
            { label: 'Fotogramas', value: `${result.snapshots.length}`, tip: 'Número de fotogramas del campo de ondas guardados para animar el corte del subsuelo.' },
          ].map(m => (
            <div key={m.label} className="bg-stone-50 rounded-lg p-3 border border-stone-100">
              <div className="text-[10px] text-stone-500 uppercase tracking-wide mb-1">
                <Tooltip content={m.tip} showIcon>{m.label}</Tooltip>
              </div>
              <div className="text-sm font-bold font-mono text-[#1A1A2E]">{m.value}</div>
            </div>
          ))}
        </div>
        {(!pArrivalDetected || !sArrivalDetected) && (
          <p className="text-[10px] text-stone-500 mt-2 italic">
            * Arribo estimado teóricamente (distancia/velocidad). No fue posible detectarlo por STA en la señal simulada.
          </p>
        )}
        <p className="text-[10px] text-stone-400 mt-1">
          Señal no calibrada: las gráficas muestran amplitud normalizada (±1); el pico está en unidades arbitrarias (u.a.).
        </p>
      </AccordionSection>

      {/* Grid info */}
      <AccordionSection title="Malla FDM" icon={<Grid3X3 size={12} />} dataTour="sim-malla" open={openSection === 'malla'} onToggle={() => toggle('malla')}>
        <div className="space-y-2">
          {[
            { label: 'Tamaño malla', value: `${gridInfo.nx} × ${gridInfo.nz}`, tip: 'Número de nodos de la malla (horizontal × profundidad) donde se resuelve la ecuación de onda.' },
            { label: 'Resolución (dx)', value: `${gridInfo.dx} m${gridInfo.dxAdjusted ? ' ⚠️' : ''}`, tip: 'Distancia entre nodos de la malla. Menor dx = más detalle, pero más costo de cálculo.' },
            { label: 'Paso temporal (dt)', value: `${(gridInfo.dt * 1000).toFixed(2)} ms${gridInfo.dtAdjusted ? ' ⚠️' : ''}`, tip: 'Intervalo de tiempo entre pasos de la simulación. Debe cumplir la condición de estabilidad CFL: dt ≤ dx/(Vp·√2).' },
            { label: 'Nodos/λ mín.', value: `${gridInfo.pointsPerWavelength.toFixed(1)}${gridInfo.pointsPerWavelength < 10 ? ' ⚠️' : ''}`, tip: 'Cuántos nodos caben en la onda más corta. Se recomiendan al menos 10 para evitar dispersión numérica.' },
            { label: 'Total pasos', value: formatBigInt(gridInfo.totalSteps), tip: 'Número de iteraciones temporales que ejecutó la simulación.' },
            { label: 'Estación virtual', value: epicentralDistanceLabel(gridInfo), tip: 'Distancia horizontal del receptor (estación virtual) al epicentro, en superficie. Se calcula desde la malla: |receptorX − fuenteX| · dx.' },
            { label: 'Fuente', value: params.sourceType === 'volcanic' ? 'Volcánica' : 'Tectónica', tip: 'Mecanismo de la fuente: volcánica (explosión isótropa, más onda P) o tectónica (doble par de cizalla, más onda S).' },
            { label: 'Magnitud', value: `Mw ${params.magnitude.toFixed(1)}`, tip: 'Magnitud momento del evento simulado. Escala logarítmica: +1 equivale a ~32× más energía.' },
          ].map(p => (
            <div key={p.label} className="flex justify-between items-center text-xs">
              <span className="text-stone-500"><Tooltip content={p.tip} showIcon>{p.label}</Tooltip></span>
              <span className="font-mono font-semibold text-[#1A1A2E]">{p.value}</span>
            </div>
          ))}
        </div>
        <p className="text-[10px] text-stone-400 mt-2">
          Estación virtual a {epicentralDistanceLabel(gridInfo)} del epicentro, en superficie.
        </p>
        {gridInfo.pointsPerWavelength < 10 && (
          <p className="text-[10px] text-[#D4A853] mt-2 bg-[#D4A853]/10 rounded-lg p-2 border border-[#D4A853]/20">
            ⚠️ Malla gruesa para la frecuencia simulada ({gridInfo.pointsPerWavelength.toFixed(1)} nodos/λ, mínimo recomendado: 10). Posible dispersión numérica: las altas frecuencias se propagan más lento de lo debido.
          </p>
        )}
        {gridInfo.dtAdjusted && (
          <p className="text-[10px] text-[#C4553A] mt-2 bg-[#C4553A]/5 rounded-lg p-2 border border-[#C4553A]/10">
            ⚠️ dt fue ajustado automáticamente para cumplir la condición CFL: dt ≤ dx/(Vp·√2)
          </p>
        )}
        {gridInfo.dxAdjusted && (
          <p className="text-[10px] text-[#C4553A] mt-2 bg-[#C4553A]/5 rounded-lg p-2 border border-[#C4553A]/10">
            ⚠️ dx fue aumentado automáticamente para representar la profundidad focal solicitada dentro de la malla.
          </p>
        )}
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
        <button onClick={() => setPdfDialog(true)} className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-[#C4553A]/30 bg-[#C4553A]/5 text-[#C4553A] font-semibold text-sm">
          <FileDown size={14} /> PDF
        </button>
      </div>
      </div>

      {/* Diálogo de opciones del PDF */}
      {pdfDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !pdfBusy && setPdfDialog(false)}>
          <div className="bg-white rounded-2xl shadow-xl border border-stone-200 w-full max-w-sm p-5" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-[#1A1A2E] text-sm mb-1 flex items-center gap-2"><FileDown size={16} className="text-[#C4553A]" /> Contenido del PDF</h3>
            <p className="text-[11px] text-stone-500 mb-3">Elige qué secciones incluir.</p>
            <div className="space-y-2">
              {([
                ['params', 'Parámetros'],
                ['metrics', 'Métricas'],
                ['seismograms', 'Sismogramas'],
                ['crossSection', 'Corte del subsuelo'],
                ['interpretation', 'Interpretación'],
              ] as [keyof PdfSections, string][]).map(([key, label]) => {
                const disabled = key === 'crossSection' && !canCrossSection;
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
                    {disabled && <span className="text-[10px] text-stone-400">(no disponible)</span>}
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
                    await exportPDF(result, { ...pdfSections, crossSection: pdfSections.crossSection && canCrossSection }, realRecord, ampScale, heatmapGrid);
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
