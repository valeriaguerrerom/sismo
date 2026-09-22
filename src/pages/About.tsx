/**
 * Página "Acerca de" (HU021).
 * Información institucional del proyecto, autoras, asesores, objetivos,
 * tecnologías, fuentes de datos y licencia de uso.
 */
import { GraduationCap, Target, Cpu, Database, BookOpen, Users, ExternalLink, Scale } from '../lib/icons';
import { Page } from '../lib/types';
import { LogoMark } from '../components/ui/Logo';

interface Props {
  onNavigate: (page: Page) => void;
}

const TECH = [
  { layer: 'Frontend', items: 'React 18 · TypeScript 5 · Vite 5 · Tailwind CSS 3 · Three.js · Leaflet' },
  { layer: 'Motor de simulación', items: 'FDM 2D (ecuación de onda elástica) en TypeScript con Web Worker y en Python con NumPy' },
  { layer: 'Backend', items: 'FastAPI · Uvicorn · NumPy · SciPy · ObsPy (MiniSEED, QuakeML, TauP/iasp91)' },
  { layer: 'Base de datos', items: 'Supabase (PostgreSQL + Auth + Row Level Security)' },
  { layer: 'Exportación', items: 'CSV · PNG (html2canvas) · PDF (jsPDF) · Excel (SheetJS)' },
  { layer: 'Calidad', items: 'ESLint · TypeScript estricto · Vitest · pytest · TypeDoc · pdoc · Swagger/OpenAPI' },
];

const DATA_SOURCES = [
  { name: 'Servicio Geológico Colombiano (SGC)', desc: 'Catálogo sísmico nacional y formas de onda MiniSEED de la Red Sismológica Nacional (red CM).', url: 'https://www.sgc.gov.co' },
  { name: 'Observatorio Vulcanológico y Sismológico de Pasto (OVSP)', desc: 'Registros de sismicidad volcánica del Galeras (LP, tornillo, tremor y volcano-tectónicos).', url: 'https://www2.sgc.gov.co/sgc/volcanes' },
  { name: 'EarthScope / IRIS', desc: 'Metadatos de estaciones federadas y catálogos de referencia.', url: 'https://www.earthscope.org' },
  { name: 'USGS', desc: 'Catálogo global de sismos históricos de gran magnitud.', url: 'https://earthquake.usgs.gov' },
];

export function About({ onNavigate }: Props) {
  return (
    <div className="min-h-screen bg-[#FAFAF8] pt-16">
      {/* Hero */}
      <div className="bg-white border-b border-stone-200/60">
        <div className="max-w-5xl mx-auto px-6 py-12 text-center">
          <div className="mx-auto mb-5"><LogoMark size={72} /></div>
          <h1 className="text-3xl md:text-4xl font-black text-[#1A1A2E] tracking-tight">Acerca de SismoNariño</h1>
          <p className="text-stone-500 mt-3 max-w-3xl mx-auto leading-relaxed">
            Prototipo de software para la síntesis y visualización triaxial de pseudo-sismogramas del subsuelo
            en Nariño, Colombia. Trabajo de grado para optar al título de Ingeniera de Sistemas.
          </p>
          <div className="flex flex-wrap justify-center gap-2 mt-5">
            {['Universidad Mariana', 'Facultad de Ingeniería', 'Ingeniería de Sistemas', 'San Juan de Pasto · 2026'].map(t => (
              <span key={t} className="text-xs font-semibold px-3 py-1.5 rounded-full bg-stone-100 text-stone-600">{t}</span>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-10 space-y-8">
        {/* Equipo */}
        <section className="grid md:grid-cols-2 gap-5">
          <div className="bg-white rounded-2xl border border-stone-200/60 p-6">
            <h2 className="flex items-center gap-2 font-bold text-[#1A1A2E] mb-4"><Users size={18} className="text-[#C4553A]" /> Autoras</h2>
            <ul className="space-y-3">
              {[
                { name: 'Valeria Sofía Guerrero Mejía', role: 'Desarrollo frontend, motor FDM y visualización' },
                { name: 'Luisa María Basante Córdoba', role: 'Procesamiento de datos sísmicos, backend y documentación' },
              ].map(p => (
                <li key={p.name} className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-full bg-[#C4553A]/10 text-[#C4553A] font-bold flex items-center justify-center text-sm flex-shrink-0">
                    {p.name.charAt(0)}
                  </div>
                  <div>
                    <div className="font-semibold text-sm text-[#1A1A2E]">{p.name}</div>
                    <div className="text-xs text-stone-400">{p.role}</div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <div className="bg-white rounded-2xl border border-stone-200/60 p-6">
            <h2 className="flex items-center gap-2 font-bold text-[#1A1A2E] mb-4"><GraduationCap size={18} className="text-[#2D6A4F]" /> Asesoría</h2>
            <ul className="space-y-3">
              {[
                { name: 'MSc. Sandro Favian Parra Pay', role: 'Asesor' },
                { name: 'PhD. Oscar Cadena Ibarra', role: 'Co-asesor' },
              ].map(p => (
                <li key={p.name} className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-full bg-[#2D6A4F]/10 text-[#2D6A4F] font-bold flex items-center justify-center text-sm flex-shrink-0">
                    {p.role.charAt(0)}
                  </div>
                  <div>
                    <div className="font-semibold text-sm text-[#1A1A2E]">{p.name}</div>
                    <div className="text-xs text-stone-400">{p.role}</div>
                  </div>
                </li>
              ))}
            </ul>
            <p className="text-xs text-stone-400 mt-4 leading-relaxed">
              Programa de Ingeniería de Sistemas · Facultad de Ingeniería · Universidad Mariana.
            </p>
          </div>
        </section>

        {/* Objetivos */}
        <section className="bg-white rounded-2xl border border-stone-200/60 p-6">
          <h2 className="flex items-center gap-2 font-bold text-[#1A1A2E] mb-3"><Target size={18} className="text-[#D4A853]" /> Objetivo general</h2>
          <p className="text-sm text-stone-600 leading-relaxed">
            Desarrollar un prototipo de software que permita la generación, procesamiento y visualización triaxial
            de pseudo-sismogramas obtenidos a partir de variables físicas del subsuelo para el análisis de la
            sismicidad tectónica y volcánica en Nariño, Colombia.
          </p>
          <h3 className="font-semibold text-sm text-[#1A1A2E] mt-5 mb-2">Objetivos específicos</h3>
          <ol className="list-decimal pl-5 space-y-2 text-sm text-stone-600 leading-relaxed">
            <li>Identificar los fundamentos teóricos de la sismología, los métodos de síntesis de sismogramas y los registros sísmicos históricos del departamento de Nariño.</li>
            <li>Construir un prototipo de software para la simulación digital que permita la generación y visualización tridimensional de pseudo-sismogramas mediante variables físicas y algoritmos de síntesis, procesamiento, análisis y visualización.</li>
            <li>Evaluar la usabilidad mediante pruebas de funcionalidad y analizar su utilidad como herramienta de apoyo en estudios sobre sismicidad en Nariño.</li>
          </ol>
        </section>

        {/* Módulos */}
        <section className="bg-white rounded-2xl border border-stone-200/60 p-6">
          <h2 className="flex items-center gap-2 font-bold text-[#1A1A2E] mb-4"><BookOpen size={18} className="text-[#6B5B95]" /> Módulos de la plataforma</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            {[
              { page: 'simulation' as Page, title: 'Simulador FDM', desc: 'Configura Vp, Vs, densidad y fuente; genera sismogramas N/E/Z y la propagación 2D/3D.' },
              { page: 'explorer' as Page, title: 'Explorador de datos', desc: 'Registros reales de la red CM del SGC y del volcán Galeras con mapa y formas de onda.' },
              { page: 'map3d' as Page, title: 'Mapa 3D', desc: 'Frentes de onda P y S sobre un bloque regional de Nariño con tiempos de viaje por estación.' },
              { page: 'education' as Page, title: 'Centro educativo', desc: 'Tipos de ondas, magnitud, profundidad, metodología FDM, glosario, línea de tiempo y quiz.' },
            ].map(m => (
              <button key={m.page} onClick={() => onNavigate(m.page)}
                className="text-left rounded-xl border border-stone-200 p-4 hover:border-[#C4553A]/40 hover:bg-[#C4553A]/5 transition-colors">
                <div className="font-semibold text-sm text-[#1A1A2E]">{m.title}</div>
                <div className="text-xs text-stone-500 mt-1 leading-relaxed">{m.desc}</div>
              </button>
            ))}
          </div>
        </section>

        {/* Tecnologías */}
        <section className="bg-white rounded-2xl border border-stone-200/60 p-6">
          <h2 className="flex items-center gap-2 font-bold text-[#1A1A2E] mb-4"><Cpu size={18} className="text-[#C4553A]" /> Tecnologías</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <tbody>
                {TECH.map(t => (
                  <tr key={t.layer} className="border-b border-stone-100 last:border-0">
                    <td className="py-2.5 pr-4 font-semibold text-[#1A1A2E] whitespace-nowrap align-top w-44">{t.layer}</td>
                    <td className="py-2.5 text-stone-600">{t.items}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Fuentes de datos */}
        <section className="bg-white rounded-2xl border border-stone-200/60 p-6">
          <h2 className="flex items-center gap-2 font-bold text-[#1A1A2E] mb-4"><Database size={18} className="text-[#2D6A4F]" /> Fuentes de datos</h2>
          <ul className="space-y-3">
            {DATA_SOURCES.map(s => (
              <li key={s.name} className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-semibold text-sm text-[#1A1A2E]">{s.name}</div>
                  <div className="text-xs text-stone-500 leading-relaxed">{s.desc}</div>
                </div>
                <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-[#C4553A] flex-shrink-0 p-1.5" title="Abrir sitio">
                  <ExternalLink size={14} />
                </a>
              </li>
            ))}
          </ul>
        </section>

        {/* Licencia */}
        <section className="bg-[#1A1A2E] text-white rounded-2xl p-6">
          <h2 className="flex items-center gap-2 font-bold mb-3"><Scale size={18} className="text-[#D4A853]" /> Uso académico y responsabilidad</h2>
          <p className="text-sm text-stone-300 leading-relaxed">
            SismoNariño es un prototipo con fines educativos e investigativos. Los pseudo-sismogramas son señales
            sintéticas generadas con un modelo simplificado (FDM 2D en medio homogéneo) y no sustituyen los
            productos oficiales del Servicio Geológico Colombiano ni deben usarse para la toma de decisiones de
            gestión del riesgo. Los conceptos, afirmaciones y opiniones emitidos en el trabajo de grado son
            responsabilidad exclusiva de las autoras (Art. 71, Reglamento de Investigaciones, Universidad Mariana).
          </p>
          <p className="text-xs text-stone-400 mt-4">Versión 1.0 · 2026 · Código fuente disponible para la comunidad académica de la Universidad Mariana.</p>
        </section>
      </div>
    </div>
  );
}
