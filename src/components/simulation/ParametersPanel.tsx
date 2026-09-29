import { useState, useEffect } from 'react';
import { SimulationParams } from '../../lib/types';
import { computeLame, presetForSource } from '../../lib/simulation';
import { formatBigInt } from '../../lib/format';
import { validateParams } from '../../lib/paramLimits';
import { Tooltip } from '../ui/Tooltip';
import { Play, Loader } from '../../lib/icons';
import { AccordionSection } from './AccordionSection';

/** Identificadores de las secciones del panel de parámetros. */
type ParamSection = 'elasticas' | 'fuente' | 'config';

/** dt estable (CFL) para un Vp y dx dados: 0.9·dx/(Vp·√2), redondeado a 4 dec. */
function cflDt(vp: number, dx: number): number {
  const safe = 0.9 * dx / (vp * Math.SQRT2);
  // Redondeo a 5 decimales; piso muy bajo para que en combinaciones extremas
  // (Vp alto + dx pequeño) el dt siga siendo estable.
  return Math.max(0.0002, Math.round(safe * 100000) / 100000);
}

interface Props {
  params: SimulationParams;
  onChange: (p: SimulationParams) => void;
  onRun: () => void;
  loading: boolean;
  /** Sección que el tour guiado quiere abrir (cambia por paso). */
  forceSection?: ParamSection | null;
  /**
   * Tiempo del primer rebote de borde de la S (s) de la última simulación,
   * calculado por el backend con la geometría real. Si está disponible, el aviso
   * de duración lo usa en vez de un valor fijo por tipo de fuente.
   */
  firstBounceS?: number | null;
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

export function ParametersPanel({ params, onChange, onRun, loading, forceSection, firstBounceS }: Props) {
  // Acordeón exclusivo: solo una sección abierta a la vez en esta columna.
  const [openSection, setOpenSection] = useState<ParamSection>('elasticas');
  const toggle = (s: ParamSection) => setOpenSection(prev => (prev === s ? ('' as ParamSection) : s));
  // Mensajes de autoajuste por campo (por qué se corrigió un valor).
  const [limitMsgs, setLimitMsgs] = useState<Record<string, string>>({});

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
    // Validación/autoajuste: rangos por campo + restricciones físicas
    // (Vs < Vp/√2 para λ ≥ 0, dx ≥ 10 nodos/λ). Se corrige al valor válido más
    // cercano y se guarda el motivo para mostrarlo junto al control.
    const { params: fixed, messages } = validateParams(next);
    // Recalcular Lamé si Vs se ajustó por la restricción física.
    if (messages.vs) {
      const { lambda, mu } = computeLame(fixed.vp, fixed.vs, fixed.density);
      fixed.lambda = lambda;
      fixed.mu = mu;
    }
    // dt se calcula AUTOMÁTICAMENTE para respetar la estabilidad (CFL) en todo
    // el rango de Vp/dx: dt = 0.9 · dx / (Vp·√2). Así el paso temporal que se
    // muestra y se envía al motor es siempre estable, sin depender del usuario.
    fixed.dt = cflDt(fixed.vp, fixed.dx);
    setLimitMsgs(messages);
    onChange(fixed);
  };

  return (
    <div className="flex flex-col gap-3 h-full min-h-0">
      {/* Zona scrolleable: acordeones + botón Generar (justo bajo Configuración). */}
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
                  // Al cambiar de tipo se aplica el preset óptimo de esa fuente
                  // (evita avisos de malla/CFL y da arribos detectables). Si ya
                  // está seleccionado, no se toca para no borrar ajustes manuales.
                  onClick={() => { if (params.sourceType !== t) onChange(presetForSource(t)); }}
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
          {/* Lat/Lon como texto con punto decimal SIEMPRE (los inputs number
              usan la coma del locale del navegador). inputMode decimal para
              teclado numérico en móvil; se acepta coma al escribir y se
              normaliza a punto. */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className="text-xs font-medium text-stone-600 block mb-1">Latitud</span>
              <input
                type="text"
                inputMode="decimal"
                value={String(params.epicenterLat)}
                onChange={e => { const v = Number(e.target.value.replace(',', '.')); if (!Number.isNaN(v)) onChange({ ...params, epicenterLat: v }); }}
                className="w-full text-xs border border-stone-200 rounded px-2 py-1 text-stone-700 bg-stone-50 focus:outline-none focus:border-[#2D6A4F]"
              />
            </div>
            <div>
              <span className="text-xs font-medium text-stone-600 block mb-1">Longitud</span>
              <input
                type="text"
                inputMode="decimal"
                value={String(params.epicenterLon)}
                onChange={e => { const v = Number(e.target.value.replace(',', '.')); if (!Number.isNaN(v)) onChange({ ...params, epicenterLon: v }); }}
                className="w-full text-xs border border-stone-200 rounded px-2 py-1 text-stone-700 bg-stone-50 focus:outline-none focus:border-[#2D6A4F]"
              />
            </div>
          </div>
          <p className="text-[10px] text-stone-400 -mt-1">
            En este modelo homogéneo 2D la ubicación del epicentro es solo una referencia geográfica: no cambia el cálculo. La distancia y el acimut de la estación sí afectan el registro.
          </p>

          {/* Dirección de la estación: orienta el corte y la rotación
              radial/transversal → Norte/Este. Aplica a ambas fuentes. */}
          <SliderRow
            label="Dirección de la estación"
            tooltip="Acimut de la estación virtual respecto a la fuente, medido desde el norte en sentido horario (0-360°). Orienta el corte del subsuelo y cómo se reparten las componentes Norte y Este."
            value={params.stationAzimuth ?? 45}
            min={0}
            max={360}
            step={5}
            unit="°"
            onChange={v => update('stationAzimuth', v)}
          />

          {/* Mecanismo focal (avanzado): solo para fuente tectónica (doble par).
              Define el tensor de momento que excita P-SV y SH. */}
          {params.sourceType === 'tectonic' && (
            <div className="pt-2 border-t border-stone-200/60 space-y-3">
              <span className="text-[11px] font-semibold text-stone-500 uppercase tracking-wide">Mecanismo focal (avanzado)</span>
              <SliderRow
                label="Rumbo (strike)"
                tooltip="Orientación de la traza de la falla en superficie, medida desde el norte en sentido horario (0-360°). Por defecto ~30° (rumbo andino de Nariño)."
                value={params.strike ?? 30}
                min={0}
                max={360}
                step={5}
                unit="°"
                onChange={v => update('strike', v)}
              />
              <SliderRow
                label="Buzamiento (dip)"
                tooltip="Inclinación del plano de falla respecto a la horizontal (0-90°). 90° es una falla vertical."
                value={params.dip ?? 45}
                min={0}
                max={90}
                step={5}
                unit="°"
                onChange={v => update('dip', v)}
              />
              <SliderRow
                label="Deslizamiento (rake)"
                tooltip="Dirección del movimiento del bloque sobre el plano de falla (-180 a 180°). 90° = falla inversa, -90° = normal, 0° = desgarre. Por defecto 90° (inversa, régimen compresivo)."
                value={params.rake ?? 90}
                min={-180}
                max={180}
                step={5}
                unit="°"
                onChange={v => update('rake', v)}
              />
            </div>
          )}
        </div>
      </AccordionSection>

      <AccordionSection title="Configuración" dataTour="params-config" open={openSection === 'config'} onToggle={() => toggle('config')}>
        <div className="space-y-4">
          <SliderRow
            label="Tiempo de Simulación"
            tooltip="Duración total del registro sísmico simulado en segundos."
            value={params.duration}
            min={5}
            max={120}
            step={1}
            unit="seg"
            onChange={v => update('duration', v)}
          />
          {/* Aviso de duración efectiva: el motor tiene un tope de pasos, así que
              la duración realmente simulada puede ser menor que la pedida. */}
          {(() => {
            const MAX_STEPS = 8000;
            const eff = Math.min(params.duration, MAX_STEPS * params.dt);
            if (eff >= params.duration - 0.05) return null;
            return (
              <p className="text-[10px] text-[#D4A853] bg-[#D4A853]/10 rounded-lg p-2 border border-[#D4A853]/20 -mt-2">
                Se simularán ≈ {eff.toFixed(0)} s (tope de {formatBigInt(MAX_STEPS)} pasos). Sube dx o baja Vp para alcanzar {params.duration} s.
              </p>
            );
          })()}
          {/* Aviso de rebote de borde: el backend calcula el tiempo del primer
              rebote de la S con la geometría real de cada simulación y lo
              devuelve. Si aún no hay resultado, se usa una estimación por tipo de
              fuente. Si la duración lo supera, aparecen reflexiones artificiales. */}
          {(() => {
            const bounceS = (typeof firstBounceS === 'number' && firstBounceS > 0)
              ? firstBounceS
              : (params.sourceType === 'volcanic' ? 13.3 : 8.4);
            if (params.duration <= bounceS + 0.05) return null;
            return (
              <p className="text-[10px] text-[#C4553A] bg-[#C4553A]/5 rounded-lg p-2 border border-[#C4553A]/10 -mt-2">
                ⚠️ La duración supera el primer rebote de borde (≈ {bounceS.toFixed(1)} s). Después de ese tiempo pueden aparecer reflexiones artificiales de los límites de la malla.
              </p>
            );
          })()}
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
          {/* Paso temporal (dt): automático según CFL (dt = 0.9·dx/(Vp·√2)). No
              es editable porque se calcula para garantizar estabilidad en todo
              el rango de Vp y dx; se muestra solo como información. */}
          <div>
            <div className="flex items-center justify-between">
              <Tooltip content="Se calcula automáticamente para cumplir la condición de estabilidad CFL: dt = 0.9·dx/(Vp·√2). Así la simulación es siempre estable." showIcon>
                <span className="text-xs font-medium text-stone-600">Paso Temporal (dt)</span>
              </Tooltip>
              <span className="text-xs font-mono font-semibold text-[#1A1A2E]">{(params.dt * 1000).toFixed(2)} ms</span>
            </div>
            <p className="text-[10px] text-stone-400 mt-1">Automático (estabilidad CFL). Courant ≈ {(params.dt * params.vp * Math.SQRT2 / params.dx).toFixed(2)}.</p>
          </div>
        </div>
      </AccordionSection>

      {/* Avisos de autoajuste: por qué se corrigió algún valor al validar. */}
      {Object.keys(limitMsgs).length > 0 && (
        <div className="shrink-0 space-y-1">
          {Object.entries(limitMsgs).map(([k, m]) => (
            <p key={k} className="text-[10px] text-[#D4A853] bg-[#D4A853]/10 rounded-lg p-2 border border-[#D4A853]/20">
              {m}
            </p>
          ))}
        </div>
      )}

      {/* Botón Generar: justo debajo de Configuración. */}
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
    </div>
  );
}
