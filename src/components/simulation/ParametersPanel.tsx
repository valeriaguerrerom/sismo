import { useState, useEffect } from 'react';
import { SimulationParams } from '../../lib/types';
import { computeLame, presetForSource } from '../../lib/simulation';
import { SCENARIOS } from '../../lib/scenarios';
import { formatBigInt } from '../../lib/format';
import { validateParams, maxEpicentralDistanceKm } from '../../lib/paramLimits';
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
  /**
   * Panel bloqueado: hay un REGISTRO REAL cargado, cuyos parámetros son fijos.
   * Los controles se muestran atenuados y cualquier intento de cambio lo maneja
   * el contenedor (pregunta si se quiere salir al laboratorio). Aquí solo se usa
   * para el aviso visual y para no dejar “generar” como acción normal.
   */
  locked?: boolean;
  /** Sección que el tour guiado quiere abrir (cambia por paso). */
  forceSection?: ParamSection | null;
  /**
   * Tiempos del primer rebote de borde (s) de la última simulación, calculados
   * por el backend con la geometría real. El aviso de duración usa el MENOR de
   * los dos (el rebote de la P suele llegar antes cuando la roca es rápida, p.
   * ej. en el modelo de dos capas). Si no hay valor, se usa un tope por tipo.
   */
  firstBounceS?: number | null;
  firstBounceP?: number | null;
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

export function ParametersPanel({ params, onChange, onRun, loading, locked = false, forceSection, firstBounceS, firstBounceP }: Props) {
  // Acordeón EXCLUSIVO: solo una sección abierta a la vez (al abrir una se
  // cierran las demás). Así el contenido siempre cabe sin scroll. Al inicio
  // solo "Variables elásticas" está abierta.
  const [openSections, setOpenSections] = useState<Set<ParamSection>>(new Set(['elasticas']));
  const toggle = (s: ParamSection) => setOpenSections(prev => (
    prev.has(s) ? new Set<ParamSection>() : new Set<ParamSection>([s])
  ));
  // Mensajes de autoajuste por campo (por qué se corrigió un valor).
  const [limitMsgs, setLimitMsgs] = useState<Record<string, string>>({});
  // Escenario seleccionado en el selector (para mostrar su descripción). Al
  // editar cualquier parámetro se pasa a "personalizado" (id vacío).
  const [scenarioId, setScenarioId] = useState<string>(SCENARIOS[0].id);
  // Sección de mecanismo focal avanzado, plegada por defecto para no abrumar.
  const [advancedOpen, setAdvancedOpen] = useState(false);

  // El tour guiado puede forzar la apertura de una sección durante un paso.
  useEffect(() => {
    if (forceSection) setOpenSections(new Set([forceSection]));
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
    // Al modificar un parámetro, el estado deja de coincidir con un escenario.
    setScenarioId('');
    onChange(fixed);
  };

  /** Carga un escenario completo (llena todos los parámetros). */
  const applyScenario = (id: string) => {
    const sc = SCENARIOS.find(s => s.id === id);
    if (!sc) return;
    setScenarioId(id);
    setLimitMsgs({});
    onChange({ ...sc.params });
  };

  return (
    <div className="flex flex-col gap-3 h-full min-h-0">
      {/* Aviso cuando hay un registro real: los parámetros son fijos (no se
          editan). Cualquier intento de cambio pregunta si se quiere pasar al
          laboratorio. Se atenúan los controles para dejarlo claro. */}
      {locked && (
        <div className="bg-[#6B5B95]/10 border border-[#6B5B95]/25 rounded-xl p-3 text-[11px] text-[#4A3F6B] leading-relaxed">
          <span className="font-bold text-[#4A3F6B]">Registro real cargado.</span> Sus parámetros son fijos; los datos reales no se modifican. Para ajustar el modelo, cámbialos y te preguntaré si quieres pasar al laboratorio de simulación.
        </div>
      )}
      {/* Cada acordeón ocupa el alto de su contenido (sin scroll interno). Si el
          conjunto (secciones + botón) no cabe en la columna, es ESTA zona la que
          scrollea suavemente; con el acordeón exclusivo el contenido suele caber
          y no aparece scroll. El botón Generar va justo debajo de las secciones. */}
      <div className={`flex flex-col gap-3 flex-1 min-h-0 overflow-y-auto scrollbar-thin pr-0.5 ${locked ? 'opacity-50 pointer-events-none' : ''}`}>
      <AccordionSection title="Variables elásticas" dataTour="params-elasticas" headerDataTour="params-elasticas-h" open={openSections.has('elasticas')} onToggle={() => toggle('elasticas')}>
        <div className="space-y-3">
          <SliderRow
            label="Velocidad de onda P (Vp)"
            tooltip="Velocidad de propagación de ondas de compresión (primarias) a través del medio. Depende del módulo volumétrico y la densidad del material."
            value={params.vp}
            min={1000}
            max={8000}
            step={100}
            unit="m/s"
            onChange={v => update('vp', v)}
          />
          <SliderRow
            label="Velocidad de onda S (Vs)"
            tooltip="Velocidad de propagación de ondas de corte (secundarias) a través del medio. Depende del módulo de rigidez y la densidad del material."
            value={params.vs}
            min={200}
            max={4500}
            step={50}
            unit="m/s"
            onChange={v => update('vs', v)}
          />
          <SliderRow
            label="Densidad del medio (ρ)"
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

          {/* ── Modelo de subsuelo: homogéneo o dos capas ── */}
          <div className="pt-2 border-t border-stone-200/60" data-tour="params-subsuelo">
            <Tooltip content="Homogéneo: un solo material en todo el subsuelo. Dos capas: una capa superficial blanda sobre un semiespacio de roca, con una interfaz entre ambos. La capa blanda amplifica el movimiento y prolonga la sacudida en superficie." showIcon>
              <span className="text-xs font-medium text-stone-600">Subsuelo</span>
            </Tooltip>
            <div className="grid grid-cols-2 gap-2 mt-1.5">
              {([['homogeneous', 'Homogéneo'], ['twoLayer', 'Dos capas']] as const).map(([m, txt]) => (
                <button
                  key={m}
                  onClick={() => { if ((params.subsurfaceModel ?? 'homogeneous') !== m) { setScenarioId(''); onChange({ ...params, subsurfaceModel: m }); } }}
                  className={`py-1.5 rounded-lg text-xs font-semibold transition-all border ${
                    (params.subsurfaceModel ?? 'homogeneous') === m
                      ? 'bg-[#2D6A4F] text-white border-[#2D6A4F]'
                      : 'bg-stone-50 text-stone-500 border-stone-200'
                  }`}
                >
                  {txt}
                </button>
              ))}
            </div>
          </div>

          {/* Controles de la capa superficial (solo en modo dos capas). Las
              variables elásticas de arriba (Vp/Vs/ρ) describen el SEMIESPACIO. */}
          {params.subsurfaceModel === 'twoLayer' && (
            <div className="space-y-3 mt-1 rounded-lg bg-stone-50/70 border border-stone-200/60 p-2.5">
              <p className="text-[10px] text-stone-500 leading-snug">
                <Tooltip content="La capa más superficial del subsuelo. Aquí suele ser blanda (velocidades bajas): atrapa y amplifica el movimiento, y hace que la sacudida dure más." showIcon><span className="font-semibold text-stone-600">Capa superficial</span></Tooltip>. Las variables elásticas de arriba describen el{' '}
                <Tooltip content="El medio de roca que hay bajo la capa superficial, que se extiende hacia abajo sin otra interfaz (por eso 'semi-espacio').">semiespacio</Tooltip> de roca.
              </p>
              <SliderRow
                label="Espesor de la capa"
                tooltip="Grosor de la capa superficial en kilómetros. Marca la profundidad de la interfaz con la roca."
                value={params.layerThickness ?? 0.5}
                min={0.05}
                max={5}
                step={0.05}
                unit="km"
                onChange={v => onChange({ ...params, layerThickness: v })}
              />
              <SliderRow
                label="Vp de la capa"
                tooltip="Velocidad de onda P de la capa superficial (blanda ⇒ baja)."
                value={params.layerVp ?? 1800}
                min={1500}
                max={5000}
                step={50}
                unit="m/s"
                onChange={v => onChange({ ...params, layerVp: v })}
              />
              <SliderRow
                label="Vs de la capa"
                tooltip="Velocidad de onda S de la capa superficial. En depósitos blandos es baja (contraste fuerte con la roca)."
                value={params.layerVs ?? 600}
                min={300}
                max={2500}
                step={25}
                unit="m/s"
                onChange={v => onChange({ ...params, layerVs: v })}
              />
              <SliderRow
                label="Densidad de la capa"
                tooltip="Densidad de la capa superficial. En depósitos volcánicos blandos es menor que la de la roca."
                value={params.layerDensity ?? 1900}
                min={1200}
                max={3000}
                step={50}
                unit="kg/m³"
                onChange={v => onChange({ ...params, layerDensity: v })}
              />
              {/* La reflexión en la interfaz solo se observa en la estación
                  cuando la fuente está DENTRO de la capa (profundidad menor que
                  el espesor). Si la fuente está en la roca, bajo la interfaz, lo
                  observable es la amplificación y la sacudida prolongada. */}
              {params.depth < (params.layerThickness ?? 0.5) ? (
                <p className="text-[10px] text-[#C4553A] leading-snug">
                  La fuente está dentro de la capa: en el mapa de calor verás la interfaz y una reflexión que vuelve a la estación, además de una sacudida más larga en superficie.
                </p>
              ) : (
                <p className="text-[10px] text-[#C4553A] leading-snug">
                  La fuente está en la roca, bajo la interfaz: en superficie la onda S se amplifica y la sacudida se prolonga. La interfaz se marca en el mapa de calor.
                </p>
              )}
            </div>
          )}
        </div>
      </AccordionSection>

      <AccordionSection title="Fuente sísmica" dataTour="params-fuente" headerDataTour="params-fuente-h" open={openSections.has('fuente')} onToggle={() => toggle('fuente')}>
        <div className="space-y-2.5">
          {/* Selector de escenario: carga un preset completo respaldado por
              fuentes. Al editar cualquier parámetro pasa a "Personalizado". */}
          <div>
            <Tooltip content="Casos de ejemplo ya listos (sismo andino, volcánico del Galeras, etc.). Al elegir uno se cargan todos sus parámetros; luego puedes cambiarlos." showIcon>
              <span className="text-xs font-medium text-stone-600">Escenario</span>
            </Tooltip>
            <select
              value={scenarioId}
              onChange={e => applyScenario(e.target.value)}
              className="w-full mt-1.5 text-xs border border-stone-200 rounded-lg px-2 py-2 text-stone-700 bg-stone-50 focus:outline-none focus:border-[#2D6A4F]"
            >
              {scenarioId === '' && <option value="">Personalizado</option>}
              {SCENARIOS.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          <div>
            <Tooltip content="Tectónica: una falla que se desliza (genera onda S fuerte). Volcánica: una explosión que empuja en todas direcciones por igual (onda P fuerte, casi sin transversal)." showIcon>
              <span className="text-xs font-medium text-stone-600">Tipo de fuente</span>
            </Tooltip>
            <div className="grid grid-cols-2 gap-2 mt-1.5">
              {(['tectonic', 'volcanic'] as const).map(t => (
                <button
                  key={t}
                  // Al cambiar de tipo se aplica el preset óptimo de esa fuente
                  // (evita avisos de malla/CFL y da arribos detectables). Si ya
                  // está seleccionado, no se toca para no borrar ajustes manuales.
                  onClick={() => { if (params.sourceType !== t) { setScenarioId(''); setLimitMsgs({}); onChange(presetForSource(t)); } }}
                  className={`py-1.5 rounded-lg text-xs font-semibold transition-all border ${
                    params.sourceType === t
                      ? 'bg-[#C4553A] text-white border-[#C4553A]'
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
            label="Profundidad focal"
            tooltip="Distancia vertical desde la superficie hasta el hipocentro (foco) del sismo. Fuentes más profundas retrasan y separan más la P y la S."
            value={params.depth}
            min={1}
            max={100}
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
              <Tooltip content="Epicentro (lat/lon) dentro de Nariño y su entorno, incluida la red CM Colombia-Ecuador. En este modelo es solo una referencia geográfica: no cambia el cálculo. Lo que afecta el registro es la distancia y la dirección de la estación." showIcon>
                <span className="text-xs font-medium text-stone-600">Latitud</span>
              </Tooltip>
              <input
                type="text"
                inputMode="decimal"
                value={String(params.epicenterLat)}
                onChange={e => { const v = Number(e.target.value.replace(',', '.')); if (!Number.isNaN(v)) onChange({ ...params, epicenterLat: v }); }}
                className="w-full mt-1 text-xs border border-stone-200 rounded px-2 py-1 text-stone-700 bg-stone-50 focus:outline-none focus:border-[#2D6A4F]"
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
        </div>
      </AccordionSection>

      <AccordionSection title="Estación y malla" dataTour="params-config" headerDataTour="params-config-h" open={openSections.has('config')} onToggle={() => toggle('config')}>
        <div className="space-y-3">
          {/* Distancia epicentral: separa en el tiempo la P y la S. El máximo
              depende de dx (lo que cabe en la malla sin acercarse a los bordes). */}
          <SliderRow
            label="Distancia de la estación"
            tooltip="A qué distancia (en km) está el sismógrafo del epicentro. Cuanto más lejos, más separadas en el tiempo llegan la onda P y la S. El máximo depende del tamaño de malla."
            value={params.epicentralDistanceKm ?? 2.5}
            min={1}
            max={maxEpicentralDistanceKm(params.dx)}
            step={0.5}
            unit="km"
            onChange={v => update('epicentralDistanceKm', v)}
          />

          {/* Dirección de la estación: orienta el corte y la rotación
              radial/transversal → Norte/Este. Aplica a ambas fuentes. */}
          <SliderRow
            label="Dirección de la estación"
            tooltip="Hacia qué rumbo está el sismógrafo respecto a la fuente (acimut: 0°=Norte, 90°=Este, en sentido de las agujas del reloj). Cambia cómo se reparte el movimiento entre las componentes Norte y Este."
            value={params.stationAzimuth ?? 45}
            min={0}
            max={360}
            step={5}
            unit="°"
            onChange={v => update('stationAzimuth', v)}
          />

          {/* Mecanismo focal (avanzado, plegado por defecto): solo para fuente
              tectónica (doble par). Define el tensor de momento que excita P-SV
              y SH. Se pliega para no abrumar a un estudiante. */}
          {params.sourceType === 'tectonic' && (
            <div className="pt-2 border-t border-stone-200/60">
              <button
                type="button"
                onClick={() => setAdvancedOpen(o => !o)}
                className="w-full flex items-center justify-between text-[11px] font-semibold text-stone-500 uppercase tracking-wide py-1"
              >
                <span>Mecanismo focal (avanzado)</span>
                <span className="text-stone-400">{advancedOpen ? '−' : '+'}</span>
              </button>
              {advancedOpen && (
                <div className="space-y-3 pt-2">
                  <p className="text-[10px] text-stone-400 leading-snug">
                    El mecanismo describe la geometría de la falla y su movimiento. Define cómo se reparte la energía entre las componentes.
                  </p>
                  <SliderRow
                    label="Rumbo (strike)"
                    tooltip="Hacia dónde apunta la falla vista desde arriba, medido desde el Norte (0-360°). En Nariño las fallas siguen la cordillera (~30°)."
                    value={params.strike ?? 30}
                    min={0}
                    max={360}
                    step={5}
                    unit="°"
                    onChange={v => update('strike', v)}
                  />
                  <SliderRow
                    label="Buzamiento (dip)"
                    tooltip="Qué tan inclinada está la falla: 0° es horizontal (acostada) y 90° es vertical (parada)."
                    value={params.dip ?? 45}
                    min={0}
                    max={90}
                    step={5}
                    unit="°"
                    onChange={v => update('dip', v)}
                  />
                  <SliderRow
                    label="Deslizamiento (rake)"
                    tooltip="Hacia dónde se mueve un bloque sobre la falla: 90° = inversa (se comprime y sube), -90° = normal (se estira y baja), 0° = de lado (desgarre)."
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
          )}
          {(() => {
            // La duración se limita al menor entre: (1) el primer rebote de
            // borde de la S —después de él aparecen reflexiones artificiales— y
            // (2) el presupuesto de cómputo (tope de pasos ≈ 15 s de cómputo).
            // Así el dominio se mantiene grande y solo se acota el tiempo.
            const MAX_STEPS = 8000;
            const computeCap = Math.floor(MAX_STEPS * params.dt); // s que caben en el tope de pasos
            // Se toma el MENOR rebote de borde (P o S): con roca rápida —p. ej.
            // el semiespacio del modelo de dos capas— el rebote de la P llega
            // antes que el de la S, así que es el que acota la ventana útil.
            const bounces = [firstBounceP, firstBounceS].filter(
              (b): b is number => typeof b === 'number' && b > 0,
            );
            const bounce = bounces.length
              ? Math.floor(Math.min(...bounces))
              : (params.sourceType === 'volcanic' ? 13 : 8);
            const maxDur = Math.max(5, Math.min(120, bounce, computeCap));
            const capReason = bounce <= computeCap
              ? `Máx ${maxDur} s: hasta el primer rebote de borde. Después aparecerían reflexiones artificiales de los límites de la malla.`
              : `Máx ${maxDur} s por el presupuesto de cómputo (tope de ${formatBigInt(MAX_STEPS)} pasos).`;
            return (
              <>
                <SliderRow
                  label="Tiempo de simulación"
                  tooltip="Duración total del registro sísmico simulado en segundos. Se limita para que la ventana no contenga reflexiones artificiales de los bordes de la malla."
                  value={Math.min(params.duration, maxDur)}
                  min={5}
                  max={maxDur}
                  step={1}
                  unit="seg"
                  onChange={v => update('duration', Math.min(v, maxDur))}
                />
                <p className="text-[10px] text-stone-400 -mt-1">{capReason}</p>
              </>
            );
          })()}
          <SliderRow
            label="Resolución espacial (dx)"
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
              <Tooltip content="Cada cuánto avanza la simulación en el tiempo. Se calcula solo para que no se 'desestabilice': la onda no puede saltar más de una celda por paso." showIcon>
                <span className="text-xs font-medium text-stone-600">Paso temporal (dt)</span>
              </Tooltip>
              <span className="text-xs font-mono font-semibold text-[#1A1A2E]">{(params.dt * 1000).toFixed(2)} ms</span>
            </div>
            <p className="text-[10px] text-stone-400 mt-1">
              Automático (estabilidad CFL).{' '}
              <Tooltip content="Número de Courant: qué fracción de una celda avanza la onda en cada paso. Debe ser menor que 1 para que la simulación sea estable.">Courant</Tooltip> ≈ {(params.dt * params.vp * Math.SQRT2 / params.dx).toFixed(2)}.
            </p>
          </div>
        </div>
      </AccordionSection>
      </div>

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

      {/* Botón Generar: justo debajo de Configuración. Con un registro real
          cargado no se genera nada (los reales no se simulan): el botón invita
          a pasar al laboratorio, y el contenedor pide confirmación. */}
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
        ) : locked ? (
          <>
            <Play size={16} />
            Ir al laboratorio de simulación
          </>
        ) : (
          <>
            <Play size={16} />
            Generar pseudo-sismograma
          </>
        )}
      </button>
    </div>
  );
}
