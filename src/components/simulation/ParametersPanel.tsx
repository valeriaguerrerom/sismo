import { useState, useEffect } from 'react';
import { SimulationParams } from '../../lib/types';
import { computeLame } from '../../lib/simulation';
import { Tooltip } from '../ui/Tooltip';
import { Play, Loader } from '../../lib/icons';
import { AccordionSection } from './AccordionSection';

/** Identificadores de las secciones del panel de parámetros. */
type ParamSection = 'elasticas' | 'fuente' | 'config';

interface Props {
  params: SimulationParams;
  onChange: (p: SimulationParams) => void;
  onRun: () => void;
  loading: boolean;
  /** Sección que el tour guiado quiere abrir (cambia por paso). */
  forceSection?: ParamSection | null;
}

function SliderRow({
  label,
  tooltip,
  value,
  min,
  max,
  step,
  unit,
  onChange,
}: {
  label: string;
  tooltip: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <Tooltip content={tooltip} showIcon>
          <span className="text-xs font-medium text-stone-600">{label}</span>
        </Tooltip>
        <div className="flex items-center gap-1">
          <input
            type="number"
            value={value}
            min={min}
            max={max}
            step={step}
            onChange={e => onChange(Number(e.target.value))}
            className="w-20 text-right text-xs border border-stone-200 rounded px-1.5 py-0.5 text-stone-700 bg-stone-50 focus:outline-none focus:border-[#2D6A4F]"
          />
          <span className="text-[10px] text-stone-500 w-10">{unit}</span>
        </div>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full h-1.5 rounded-full appearance-none cursor-pointer accent-[#2D6A4F]"
        style={{ background: `linear-gradient(to right, #2D6A4F ${((value - min) / (max - min)) * 100}%, rgba(255,255,255,0.06) ${((value - min) / (max - min)) * 100}%)` }}
      />
    </div>
  );
}

export function ParametersPanel({ params, onChange, onRun, loading, forceSection }: Props) {
  // Acordeón exclusivo: solo una sección abierta a la vez en esta columna.
  const [openSection, setOpenSection] = useState<ParamSection>('elasticas');
  const toggle = (s: ParamSection) => setOpenSection(prev => (prev === s ? ('' as ParamSection) : s));

  // El tour guiado puede forzar la apertura de una sección durante un paso.
  useEffect(() => {
    if (forceSection) setOpenSection(forceSection);
  }, [forceSection]);

  const update = (key: keyof SimulationParams, val: number | string) => {
    const next = { ...params, [key]: val };
    if (['vp', 'vs', 'density'].includes(key as string)) {
      const { lambda, mu } = computeLame(
        key === 'vp' ? val as number : next.vp,
        key === 'vs' ? val as number : next.vs,
        key === 'density' ? val as number : next.density,
      );
      next.lambda = lambda;
      next.mu = mu;
    }
    onChange(next);
  };

  return (
    <div className="flex flex-col gap-3 h-full min-h-0">
      {/* Zona scrolleable: acordeones. El botón Generar queda fijo abajo. */}
      <div className="flex flex-col gap-3 flex-1 min-h-0 overflow-y-auto scrollbar-thin pr-0.5">
      <AccordionSection title="Variables Elásticas" dataTour="params-elasticas" open={openSection === 'elasticas'} onToggle={() => toggle('elasticas')}>
        <div className="space-y-4">
          <SliderRow
            label="Velocidad de Onda P (Vp)"
            tooltip="Velocidad de propagación de ondas de compresión (primarias) a través del medio. Depende del módulo volumétrico y la densidad del material."
            value={params.vp}
            min={1000}
            max={8000}
            step={100}
            unit="m/s"
            onChange={v => update('vp', v)}
          />
          <SliderRow
            label="Velocidad de Onda S (Vs)"
            tooltip="Velocidad de propagación de ondas de corte (secundarias) a través del medio. Depende del módulo de rigidez y la densidad del material."
            value={params.vs}
            min={200}
            max={4500}
            step={50}
            unit="m/s"
            onChange={v => update('vs', v)}
          />
          <SliderRow
            label="Densidad del Medio (ρ)"
            tooltip="Densidad volumétrica del material geológico. Varía entre ~1800 kg/m³ (suelo blando) y ~3200 kg/m³ (roca ígnea densa)."
            value={params.density}
            min={1500}
            max={3500}
            step={50}
            unit="kg/m³"
            onChange={v => update('density', v)}
          />
          <div className="grid grid-cols-2 gap-2 pt-1 border-t border-stone-200/60 mt-2">
            <div>
              <Tooltip content="Parámetro de Lamé λ: relaciona esfuerzo y deformación volumétrica. Se calcula como ρ·Vp² - 2·μ." showIcon>
                <span className="text-[10px] text-stone-500">Parámetro λ</span>
              </Tooltip>
              <div className="text-xs font-mono text-[#1A1A2E] font-semibold mt-0.5">
                {(params.lambda / 1e9).toFixed(2)} GPa
              </div>
            </div>
            <div>
              <Tooltip content="Módulo de corte μ (segundo parámetro de Lamé): resistencia del material a la deformación por corte. μ = ρ·Vs²." showIcon>
                <span className="text-[10px] text-stone-500">Módulo μ</span>
              </Tooltip>
              <div className="text-xs font-mono text-[#1A1A2E] font-semibold mt-0.5">
                {(params.mu / 1e9).toFixed(2)} GPa
              </div>
            </div>
          </div>
        </div>
      </AccordionSection>

      <AccordionSection title="Fuente Sísmica" dataTour="params-fuente" open={openSection === 'fuente'} onToggle={() => toggle('fuente')}>
        <div className="space-y-4">
          <div>
            <span className="text-xs font-medium text-stone-600">Tipo de Fuente</span>
            <div className="grid grid-cols-2 gap-2 mt-1.5">
              {(['tectonic', 'volcanic'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => onChange({ ...params, sourceType: t })}
                  className={`py-1.5 rounded-lg text-xs font-semibold transition-all border ${
                    params.sourceType === t
                      ? t === 'tectonic'
                        ? 'bg-[#6B5B95] text-white border-[#6B5B95]'
                        : 'bg-[#C4553A] text-white border-[#C4553A]'
                      : 'bg-stone-50 text-stone-500 border-stone-200'
                  }`}
                >
                  {t === 'tectonic' ? 'Tectónica' : 'Volcánica'}
                </button>
              ))}
            </div>
          </div>
          <SliderRow
            label="Magnitud"
            tooltip="Magnitud momento (Mw) del evento sísmico. Escala logarítmica: cada unidad implica ~31.6× más energía liberada."
            value={params.magnitude}
            min={2.0}
            max={9.0}
            step={0.1}
            unit="Mw"
            onChange={v => update('magnitude', v)}
          />
          <SliderRow
            label="Profundidad Focal"
            tooltip="Distancia vertical desde la superficie hasta el hipocentro (foco) del sismo. Sismos superficiales (<70 km) son generalmente más destructivos."
            value={params.depth}
            min={1}
            max={300}
            step={1}
            unit="km"
            onChange={v => update('depth', v)}
          />
          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className="text-xs font-medium text-stone-600 block mb-1">Latitud</span>
              <input
                type="number"
                value={params.epicenterLat}
                step={0.01}
                onChange={e => onChange({ ...params, epicenterLat: Number(e.target.value) })}
                className="w-full text-xs border border-stone-200 rounded px-2 py-1 text-stone-700 bg-stone-50 focus:outline-none focus:border-[#2D6A4F]"
              />
            </div>
            <div>
              <span className="text-xs font-medium text-stone-600 block mb-1">Longitud</span>
              <input
                type="number"
                value={params.epicenterLon}
                step={0.01}
                onChange={e => onChange({ ...params, epicenterLon: Number(e.target.value) })}
                className="w-full text-xs border border-stone-200 rounded px-2 py-1 text-stone-700 bg-stone-50 focus:outline-none focus:border-[#2D6A4F]"
              />
            </div>
          </div>
        </div>
      </AccordionSection>

      <AccordionSection title="Configuración" open={openSection === 'config'} onToggle={() => toggle('config')}>
        <div className="space-y-4">
          <SliderRow
            label="Tiempo de Simulación"
            tooltip="Duración total del registro sísmico simulado en segundos."
            value={params.duration}
            min={10}
            max={120}
            step={5}
            unit="seg"
            onChange={v => update('duration', v)}
          />
          <SliderRow
            label="Resolución Espacial (dx)"
            tooltip="Tamaño del paso de malla espacial en metros. Valores menores dan mayor precisión pero mayor costo computacional."
            value={params.dx}
            min={10}
            max={500}
            step={10}
            unit="m"
            onChange={v => update('dx', v)}
          />
          <SliderRow
            label="Paso Temporal (dt)"
            tooltip="Incremento de tiempo en segundos entre muestras. Debe cumplir la condición CFL: dt ≤ dx / (Vp·√2)."
            value={params.dt}
            min={0.005}
            max={0.1}
            step={0.005}
            unit="s"
            onChange={v => update('dt', v)}
          />
          {/* CFL stability check */}
          {params.dt > params.dx / (params.vp * Math.SQRT2) && (
            <p className="text-[10px] text-[#C4553A] bg-[#C4553A]/5 rounded-lg p-2 border border-[#C4553A]/10">
              ⚠️ dt excede el límite CFL ({(params.dx / (params.vp * Math.SQRT2) * 1000).toFixed(1)} ms). Se ajustará automáticamente.
            </p>
          )}
        </div>
      </AccordionSection>
      </div>

      {/* Botón Generar: fijo abajo, siempre visible (fuera del scroll). */}
      <button
        data-tour="btn-generar"
        onClick={onRun}
        disabled={loading}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-[#C4553A] text-white font-bold text-sm shadow-lg shadow-[#C4553A]/20 disabled:opacity-60 disabled:cursor-not-allowed shrink-0"
      >
        {loading ? (
          <>
            <Loader size={16} className="animate-spin" />
            Procesando...
          </>
        ) : (
          <>
            <Play size={16} />
            Generar Pseudo-Sismograma
          </>
        )}
      </button>
    </div>
  );
}
