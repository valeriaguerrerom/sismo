/**
 * Sección educativa: metodología del Método de Diferencias Finitas (RF-24).
 * Explica paso a paso cómo el simulador resuelve la ecuación de onda elástica.
 */
import { useState } from 'react';
import { Grid3X3, Clock, Shield, Zap, Activity, CheckCircle2 } from '../../lib/icons';

const STEPS = [
  {
    id: 'ecuacion',
    icon: <Activity size={16} />,
    title: '1. Ecuación de onda elástica',
    color: '#C4553A',
    body: (
      <>
        <p>El subsuelo se modela como un medio elástico, isótropo y homogéneo. El desplazamiento <b>u</b> obedece:</p>
        <div className="font-mono text-sm bg-stone-50 border border-stone-200 rounded-lg p-3 my-3 text-center">
          ρ ∂²u/∂t² = (λ + 2μ) ∇(∇·u) − μ ∇×(∇×u) + f
        </div>
        <p>
          Los parámetros de Lamé se calculan a partir de las variables físicas que configuras:
          <span className="font-mono"> μ = ρ·Vs²</span> y <span className="font-mono">λ = ρ·Vp² − 2μ</span>.
          El término <b>f</b> es la fuente sísmica (tectónica o volcánica).
        </p>
      </>
    ),
  },
  {
    id: 'malla',
    icon: <Grid3X3 size={16} />,
    title: '2. Discretización espacial (malla)',
    color: '#2D6A4F',
    body: (
      <>
        <p>
          El dominio 2D (distancia horizontal × profundidad) se divide en una malla de <b>nx × nz</b> nodos separados
          una distancia <b>dx</b>. Las derivadas espaciales se aproximan con diferencias centradas de segundo orden:
        </p>
        <div className="font-mono text-sm bg-stone-50 border border-stone-200 rounded-lg p-3 my-3 text-center">
          ∂²u/∂x² ≈ (u<sub>i+1</sub> − 2u<sub>i</sub> + u<sub>i−1</sub>) / dx²
        </div>
        <p>
          Las derivadas cruzadas ∂²u/∂x∂z usan un esténcil de cuatro puntos. Para evitar dispersión numérica se
          recomienda al menos <b>10 nodos por longitud de onda</b> mínima; el panel de resultados lo verifica.
        </p>
      </>
    ),
  },
  {
    id: 'tiempo',
    icon: <Clock size={16} />,
    title: '3. Integración temporal (leapfrog)',
    color: '#6B5B95',
    body: (
      <>
        <p>El tiempo avanza en pasos <b>dt</b> con un esquema explícito de salto de rana (leapfrog):</p>
        <div className="font-mono text-sm bg-stone-50 border border-stone-200 rounded-lg p-3 my-3 text-center">
          u<sup>n+1</sup> = 2u<sup>n</sup> − u<sup>n−1</sup> + dt² · (L u<sup>n</sup> + f<sup>n</sup>) / ρ
        </div>
        <p>
          Se conservan solo dos instantes anteriores, por lo que el consumo de memoria es bajo y el cálculo
          puede correr en el navegador dentro de un Web Worker.
        </p>
      </>
    ),
  },
  {
    id: 'cfl',
    icon: <Shield size={16} />,
    title: '4. Estabilidad: condición CFL',
    color: '#D4A853',
    body: (
      <>
        <p>Un esquema explícito solo es estable si la onda no recorre más de una celda por paso de tiempo:</p>
        <div className="font-mono text-sm bg-stone-50 border border-stone-200 rounded-lg p-3 my-3 text-center">
          dt ≤ dx / (Vp · √2)
        </div>
        <p>
          Si el <b>dt</b> que eliges viola esta condición de Courant–Friedrichs–Lewy, el simulador lo reduce
          automáticamente y te lo advierte. Sin ella, la solución crece sin control y "explota".
        </p>
      </>
    ),
  },
  {
    id: 'fuente',
    icon: <Zap size={16} />,
    title: '5. Fuente y condiciones de frontera',
    color: '#C4553A',
    body: (
      <>
        <p>
          La fuente es una <b>ondícula de Ricker</b> aplicada en el hipocentro con distribución gaussiana.
          Para sismos <b>tectónicos</b> se usa un mecanismo de <b>doble par</b> (radiación con lóbulos);
          para <b>volcánicos</b>, un mecanismo <b>isótropo</b> (explosivo, radiación uniforme).
        </p>
        <ul className="list-disc pl-5 mt-2 space-y-1">
          <li><b>Superficie libre</b> (z = 0): esfuerzo nulo mediante espejo antisimétrico.</li>
          <li><b>Bordes absorbentes</b>: capa "esponja" con amortiguamiento cuadrático que evita reflexiones artificiales.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'salida',
    icon: <CheckCircle2 size={16} />,
    title: '6. Registro triaxial y detección de arribos',
    color: '#2D6A4F',
    body: (
      <>
        <p>
          Un receptor virtual en superficie registra el movimiento. La componente <b>Este</b> es la radial, la
          <b> Vertical</b> es u<sub>z</sub> y la <b>Norte</b> se aproxima como gradiente lateral (proxy transversal),
          dado que el modelo es 2D.
        </p>
        <p className="mt-2">
          Los tiempos de arribo de las ondas P y S se detectan con un algoritmo <b>STA</b> (promedio de corto plazo)
          y se comparan con el valor teórico <span className="font-mono">t = d / v</span>.
          Cada cierto número de pasos se guarda una instantánea del campo de onda para la vista 3D.
        </p>
      </>
    ),
  },
];

export function FdmMethodology() {
  const [open, setOpen] = useState<string>('ecuacion');

  return (
    <div className="grid lg:grid-cols-[280px_1fr] gap-4">
      <div className="space-y-2">
        {STEPS.map(s => (
          <button key={s.id} onClick={() => setOpen(s.id)}
            className={`w-full text-left flex items-center gap-2.5 px-4 py-3 rounded-xl border text-sm font-semibold transition-colors ${
              open === s.id ? 'bg-white border-stone-300 shadow-sm text-[#1A1A2E]' : 'bg-white/60 border-stone-200/60 text-stone-500'
            }`}>
            <span style={{ color: s.color }}>{s.icon}</span>
            {s.title}
          </button>
        ))}
        <div className="bg-[#1A1A2E] text-white rounded-xl p-4 text-xs leading-relaxed mt-3">
          <div className="font-bold text-[#D4A853] mb-1">Parámetros por defecto</div>
          Vp 3500 m/s · Vs 2000 m/s · ρ 2600 kg/m³ · dx 100 m · dt 0.02 s · malla ≈ 200 × 150 · duración 60 s.
          Una simulación completa tarda menos de 15 s en un equipo de escritorio.
        </div>
      </div>
      <div className="bg-white rounded-2xl border border-stone-200/60 p-6 text-sm text-stone-600 leading-relaxed animate-fade-in" key={open}>
        {STEPS.filter(s => s.id === open).map(s => (
          <div key={s.id}>
            <h3 className="text-lg font-black text-[#1A1A2E] mb-3 flex items-center gap-2">
              <span style={{ color: s.color }}>{s.icon}</span> {s.title}
            </h3>
            {s.body}
          </div>
        ))}
      </div>
    </div>
  );
}
