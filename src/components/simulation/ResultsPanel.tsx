import { SimulationResult } from '../../lib/types';
import { Download, FileText, AlertCircle, Grid3X3, Image, FileDown } from '../../lib/icons';
import { interpretSimulation } from '../../lib/interpretation';
import { downloadReportPdf, downsampleWave } from '../../lib/reportPdf';
import { exportPNG } from '../../lib/exportImage';

interface Props {
  result: SimulationResult | null;
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

/** Exporta la simulación actual como reporte PDF (RF-19). */
function exportPDF(result: SimulationResult) {
  const { params } = result;
  downloadReportPdf({
    title: `Simulación ${params.sourceType === 'volcanic' ? 'volcánica' : 'tectónica'} Mw ${params.magnitude.toFixed(1)}`,
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
      waveData: downsampleWave(result.waveData, 1200),
    },
  }, 'sismograma_narino');
}

export function ResultsPanel({ result }: Props) {
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
    <div className="flex flex-col gap-4 h-full overflow-y-auto pr-1 scrollbar-thin">
      {/* Metrics */}
      <div className="bg-white rounded-xl border border-stone-200/60 p-4">
        <h3 className="text-xs font-bold uppercase tracking-widest text-[#1A1A2E] mb-3">Métricas</h3>
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
      </div>

      {/* Grid info */}
      <div className="bg-white rounded-xl border border-stone-200/60 p-4">
        <h3 className="text-xs font-bold uppercase tracking-widest text-[#1A1A2E] mb-3 flex items-center gap-1.5">
          <Grid3X3 size={12} /> Malla FDM
        </h3>
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
      </div>

      {/* Interpretation */}
      <div className="bg-[#2D6A4F]/10 border border-[#2D6A4F]/20 rounded-xl p-4">
        <h3 className="text-xs font-bold uppercase tracking-widest text-[#2D6A4F] mb-2 flex items-center gap-1.5">
          <FileText size={12} /> Interpretación
        </h3>
        <p className="text-xs text-stone-600 leading-relaxed">{interpretResult(result)}</p>
      </div>

      {/* Export buttons */}
      <div className="flex gap-2">
        <button onClick={() => exportCSV(result)} className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-stone-200 text-[#1A1A2E] font-semibold text-sm">
          <Download size={14} /> CSV
        </button>
        <button onClick={() => exportPNG()} className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-stone-200 text-[#1A1A2E] font-semibold text-sm">
          <Image size={14} /> PNG
        </button>
        <button onClick={() => exportPDF(result)} className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-[#C4553A]/30 bg-[#C4553A]/5 text-[#C4553A] font-semibold text-sm">
          <FileDown size={14} /> PDF
        </button>
      </div>
    </div>
  );
}
