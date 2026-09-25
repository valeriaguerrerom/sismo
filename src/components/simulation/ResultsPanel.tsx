import { useState, useEffect } from 'react';
import { SimulationResult, WaveData } from '../../lib/types';
import { Download, FileText, AlertCircle, Grid3X3, Image, FileDown } from '../../lib/icons';
import { interpretSimulation } from '../../lib/interpretation';
import { downloadReportPdf, downsampleWave } from '../../lib/reportPdf';
import { exportPNG } from '../../lib/exportImage';
import { AccordionSection } from './AccordionSection';

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
  // Amplitude is uncalibrated displacement — show as relative
  return maxAmplitude.toExponential(2) + ' (u.a.)';
}

function interpretResult(result: SimulationResult): string {
  return interpretSimulation(result);
}

/**
 * Exporta el reporte PDF (RF-19). Si hay un registro real cargado, el PDF
 * muestra esa señal (la misma que la pantalla), no el pseudo-sismograma FDM.
 */
function exportPDF(result: SimulationResult, realRecord?: RealRecordInfo | null) {
  const { params } = result;
  const title = realRecord
    ? `Registro real ${realRecord.label}`
    : `Simulación ${params.sourceType === 'volcanic' ? 'volcánica' : 'tectónica'} Mw ${params.magnitude.toFixed(1)}`;
  downloadReportPdf({
    title,
    params,
    results: {
      maxAmplitude: result.maxAmplitude,
      duration: result.duration,
      dominantFrequency: result.dominantFrequency,
      pArrival: result.pArrival,
      sArrival: result.sArrival,
      pArrivalDetected: result.pArrivalDetected,
      sArrivalDetected: result.sArrivalDetected,
      gridInfo: result.gridInfo,
      // Con registro real: la señal real que se ve en pantalla, sin marcas P/S.
      waveData: downsampleWave(realRecord ? realRecord.waveData : result.waveData, 1200),
      isRealRecord: Boolean(realRecord),
      realLabel: realRecord?.label,
    },
  }, 'sismograma_narino');
}

export function ResultsPanel({ result, realRecord, forceSection }: Props) {
  // Acordeón exclusivo: solo una sección abierta a la vez en esta columna.
  const [openSection, setOpenSection] = useState<ResultSection>('metricas');
  const toggle = (s: ResultSection) => setOpenSection(prev => (prev === s ? ('' as ResultSection) : s));

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
      <AccordionSection title="Métricas" open={openSection === 'metricas'} onToggle={() => toggle('metricas')}>
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: 'Amplitud Máx.', value: formatAmplitude(maxAmplitude) },
            { label: 'Duración', value: `${duration.toFixed(0)} s` },
            { label: 'Frec. Dominante', value: `${dominantFrequency.toFixed(1)} Hz` },
            { label: 'Vp/Vs', value: `${(params.vp / params.vs).toFixed(2)}` },
            { label: 'Arribo Onda P', value: `${pArrival.toFixed(2)} s${pArrivalDetected ? '' : ' *'}` },
            { label: 'Arribo Onda S', value: `${sArrival.toFixed(2)} s${sArrivalDetected ? '' : ' *'}` },
            { label: 'Impedancia', value: `${(impedance / 1e6).toFixed(2)} MRayl` },
            { label: 'Snapshots', value: `${result.snapshots.length}` },
          ].map(m => (
            <div key={m.label} className="bg-stone-50 rounded-lg p-3 border border-stone-100">
              <div className="text-[10px] text-stone-500 uppercase tracking-wide mb-1">{m.label}</div>
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
          Amplitud en unidades arbitrarias (desplazamiento no calibrado).
        </p>
      </AccordionSection>

      {/* Grid info */}
      <AccordionSection title="Malla FDM" icon={<Grid3X3 size={12} />} open={openSection === 'malla'} onToggle={() => toggle('malla')}>
        <div className="space-y-2">
          {[
            { label: 'Tamaño malla', value: `${gridInfo.nx} × ${gridInfo.nz}` },
            { label: 'Resolución (dx)', value: `${gridInfo.dx} m${gridInfo.dxAdjusted ? ' ⚠️' : ''}` },
            { label: 'Paso temporal (dt)', value: `${(gridInfo.dt * 1000).toFixed(2)} ms${gridInfo.dtAdjusted ? ' ⚠️' : ''}` },
            { label: 'Nodos/λ mín.', value: `${gridInfo.pointsPerWavelength.toFixed(1)}${gridInfo.pointsPerWavelength < 10 ? ' ⚠️' : ''}` },
            { label: 'Total pasos', value: gridInfo.totalSteps.toLocaleString() },
            { label: 'Fuente', value: params.sourceType === 'volcanic' ? 'Volcánica' : 'Tectónica' },
            { label: 'Magnitud', value: `Mw ${params.magnitude.toFixed(1)}` },
          ].map(p => (
            <div key={p.label} className="flex justify-between items-center text-xs">
              <span className="text-stone-500">{p.label}</span>
              <span className="font-mono font-semibold text-[#1A1A2E]">{p.value}</span>
            </div>
          ))}
        </div>
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
      <AccordionSection title="Interpretación" icon={<FileText size={12} />} open={openSection === 'interpretacion'} onToggle={() => toggle('interpretacion')}>
        <p className="text-xs text-stone-600 leading-relaxed">{interpretResult(result)}</p>
      </AccordionSection>
      </div>

      {/* Botones de exportación: fijos abajo, siempre visibles (fuera del scroll). */}
      <div className="flex gap-2 pt-3 border-t border-stone-200/60 shrink-0">
        <button onClick={() => exportCSV(result)} className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-stone-200 text-[#1A1A2E] font-semibold text-sm">
          <Download size={14} /> CSV
        </button>
        <button onClick={() => exportPNG()} className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-stone-200 text-[#1A1A2E] font-semibold text-sm">
          <Image size={14} /> PNG
        </button>
        <button onClick={() => exportPDF(result, realRecord)} className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-[#C4553A]/30 bg-[#C4553A]/5 text-[#C4553A] font-semibold text-sm">
          <FileDown size={14} /> PDF
        </button>
      </div>
    </div>
  );
}
